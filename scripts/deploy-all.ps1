$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$deployHost = '179.198.209.152'
$deployUser = 'root'
$deployKey = 'C:\Users\HP\.ssh\chatpilot-kvm1-deploy'
$expectedFingerprint = 'SHA256:EZbYjvOX7av3mN2h1xt4YBSA+zUXGBGnt6d2oU22Iqc'
$knownHosts = Join-Path $repoRoot 'tmp\deploy_known_hosts'

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

Set-Location $repoRoot
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot 'tmp') | Out-Null

$trackedChanges = git status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0) { throw 'Could not read Git status.' }
if ($trackedChanges) {
  throw 'Commit tracked changes before deploying so the release remains reproducible.'
}

Write-Host 'Validating backend and frontend...'
Invoke-Checked -FilePath npm -ArgumentList @('--prefix', 'ChatPilot', 'test', '--', '--runInBand')
Invoke-Checked -FilePath npm -ArgumentList @('--prefix', 'ChatPilot', 'run', 'build')
Invoke-Checked -FilePath npm -ArgumentList @('--prefix', 'frontend', 'run', 'build')

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
Invoke-Checked -FilePath ssh -ArgumentList @('-i', $deployKey, '-o', 'StrictHostKeyChecking=accept-new', '-o', "UserKnownHostsFile=$knownHosts", "$deployUser@$deployHost", 'true')
$fingerprintOutput = (& ssh-keygen -lf $knownHosts) -join "`n"
if ($LASTEXITCODE -ne 0 -or $fingerprintOutput -notmatch [regex]::Escape($expectedFingerprint)) {
  throw 'Production host fingerprint did not match the pinned fingerprint.'
}

Write-Host "Uploading backend release $sha..."
Invoke-Checked -FilePath scp -ArgumentList @('-i', $deployKey, '-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$knownHosts", $archive, "${deployUser}@${deployHost}:/tmp/release-$sha.tar")

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
docker compose -p deployment --env-file .env build chatpilot
docker compose -p deployment --env-file .env run --rm --no-deps chatpilot npx prisma migrate deploy
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
Invoke-Checked -FilePath ssh -ArgumentList @('-i', $deployKey, '-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$knownHosts", "$deployUser@$deployHost", $remoteDeploy)

Write-Host 'Deploying the Cloudflare frontend and R2-backed media routes...'
Invoke-Checked -FilePath npm -ArgumentList @('--prefix', 'frontend', 'run', 'deploy')

$api = Invoke-WebRequest -Uri 'https://api.trygetchurnshield.com/api/v1/' -Method GET
if ($api.StatusCode -ne 200) { throw 'Production API health check failed.' }
$frontend = Invoke-WebRequest -Uri 'https://chatpilot.trygetchurnshield.com/' -Method GET
if ($frontend.StatusCode -lt 200 -or $frontend.StatusCode -ge 400) {
  throw 'Production frontend health check failed.'
}

Write-Host "Deployment complete: $sha (Hostinger API + Cloudflare frontend)."
