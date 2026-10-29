$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$deployHost = '187.77.182.157'
$deployUser = 'root'
$deployKey = 'C:\Users\HP\.ssh\chatpilot-kvm1-deploy'
$expectedFingerprint = 'SHA256:TXtaqzdXJnJivSL5vjjVHk/NHr3dVwHyTKzL9lSoiKM'
$knownHosts = Join-Path $repoRoot 'tmp\deploy_known_hosts'
$sshKexOption = 'KexAlgorithms=curve25519-sha256'

# Interactive Wrangler login is not available in this deployment workflow.
# Prefer the process environment, then the current Windows user's protected
# environment. The token is never stored in or printed by this repository.
if (-not $env:CLOUDFLARE_API_TOKEN) {
  $userCloudflareToken = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'User')
  if ($userCloudflareToken) {
    $env:CLOUDFLARE_API_TOKEN = $userCloudflareToken
  }
}
if (-not $env:CLOUDFLARE_API_TOKEN) {
  throw 'CLOUDFLARE_API_TOKEN is not configured for this Windows user.'
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

function Invoke-NpmChecked {
  param(
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )
  # npm scripts on Windows execute through nested .cmd files. Run them in a
  # child process so a script-level exit cannot terminate this release runner.
  $process = Start-Process -FilePath 'npm.cmd' -ArgumentList $ArgumentList -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "npm.cmd failed with exit code $($process.ExitCode)"
  }
}

Set-Location $repoRoot
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot 'tmp') | Out-Null

$trackedChanges = git status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0) { throw 'Could not read Git status.' }
if ($trackedChanges) {
  throw 'Commit tracked changes before deploying so the release remains reproducible.'
}

Write-Host 'Validating backend and frontend...'
Invoke-NpmChecked -ArgumentList @('--prefix', 'ChatPilot', 'test', '--', '--runInBand')
Invoke-NpmChecked -ArgumentList @('--prefix', 'ChatPilot', 'run', 'build')
Invoke-NpmChecked -ArgumentList @('--prefix', 'frontend', 'run', 'build')

Write-Host 'Publishing the release commit...'
Invoke-Checked -FilePath git -ArgumentList @('push', 'origin', 'HEAD:main')
$sha = (git rev-parse --short HEAD).Trim()
if (-not $sha) { throw 'Could not resolve the release commit.' }

$archive = Join-Path $repoRoot "tmp\release-$sha.tar"
Invoke-Checked -FilePath git -ArgumentList @('archive', '--format=tar', '-o', $archive, $sha)

if (-not (Test-Path -LiteralPath $deployKey)) {
  throw "Deployment key not found at $deployKey"
}

Write-Host 'Verifying the pinned production host...'
Invoke-Checked -FilePath ssh -ArgumentList @('-i', $deployKey, '-o', $sshKexOption, '-o', 'StrictHostKeyChecking=accept-new', '-o', "UserKnownHostsFile=$knownHosts", "$deployUser@$deployHost", 'true')
$fingerprintOutput = (& ssh-keygen -lf $knownHosts) -join "`n"
if ($LASTEXITCODE -ne 0 -or $fingerprintOutput -notmatch [regex]::Escape($expectedFingerprint)) {
  throw 'Production host fingerprint did not match the pinned fingerprint.'
}

Write-Host "Uploading backend release $sha..."
Invoke-Checked -FilePath scp -ArgumentList @('-O', '-i', $deployKey, '-o', $sshKexOption, '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$knownHosts", $archive, "${deployUser}@${deployHost}:/tmp/release-$sha.tar")

$remoteDeploy = @'
set -e
RELEASE=/opt/churnshield/releases/__SHA__
if [ ! -d "$RELEASE" ]; then
  install -d -m 755 "$RELEASE"
  tar -xf /tmp/release-__SHA__.tar -C "$RELEASE"
  cp /opt/churnshield/current/infra/hostinger/.env "$RELEASE/infra/hostinger/.env"
  chmod 600 "$RELEASE/infra/hostinger/.env"
fi
cd "$RELEASE/infra/hostinger"
docker compose -p deployment --env-file .env config --quiet
docker compose -p deployment --env-file .env build chatpilot whatsapp-bot
docker compose -p deployment --env-file .env run --rm --no-deps chatpilot npx prisma migrate deploy
docker compose -p deployment --env-file .env up -d --no-deps whatsapp-bot
bot_healthy=0
for attempt in $(seq 1 30); do
  if docker exec whatsapp-bot wget -q -O /dev/null http://127.0.0.1:3001/api/v1/whatsapp/sessions; then
    bot_healthy=1
    break
  fi
  sleep 2
done
if [ "$bot_healthy" -ne 1 ]; then
  docker logs --tail=150 whatsapp-bot
  exit 1
fi
docker compose -p deployment --env-file .env up -d --no-deps chatpilot
healthy=0
for attempt in $(seq 1 20); do
  if docker exec chatpilot wget -q -O /dev/null http://127.0.0.1:3000/api/v1/; then
    healthy=1
    break
  fi
  sleep 2
done
if [ "$healthy" -ne 1 ]; then
  docker logs --tail=150 chatpilot
  exit 1
fi
docker exec chatpilot wget -q -O /dev/null http://whatsapp-bot:3001/api/v1/whatsapp/sessions
ln -sfn "$RELEASE" /opt/churnshield/current.next
mv -Tf /opt/churnshield/current.next /opt/churnshield/current
echo "Hostinger backend active: $(readlink -f /opt/churnshield/current)"
docker inspect -f '{{.Name}} {{.State.Status}} {{.State.StartedAt}}' chatpilot whatsapp-bot
'@.Replace('__SHA__', $sha)

Write-Host 'Deploying the Hostinger backend...'
Invoke-Checked -FilePath ssh -ArgumentList @('-i', $deployKey, '-o', $sshKexOption, '-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$knownHosts", "$deployUser@$deployHost", $remoteDeploy)

Write-Host 'Deploying the Cloudflare frontend and R2-backed media routes...'
Invoke-NpmChecked -ArgumentList @('--prefix', 'frontend', 'run', 'deploy')

Invoke-Checked -FilePath 'curl.exe' -ArgumentList @('--fail', '--silent', '--show-error', '--output', 'NUL', 'https://api.trygetchurnshield.com/api/v1/')
Invoke-Checked -FilePath 'curl.exe' -ArgumentList @('--fail', '--silent', '--show-error', '--output', 'NUL', 'https://chatpilot.trygetchurnshield.com/')

Write-Host "Deployment complete: $sha (Hostinger API + Cloudflare frontend)."
