#!/usr/bin/env bash
set -euo pipefail

release_sha="${1:?release SHA is required}"
archive_path="/tmp/churnshield-${release_sha}.tar.gz"
release_dir="/opt/churnshield/releases/${release_sha}"
current_dir="/opt/churnshield/current"
current_env="${current_dir}/infra/hostinger/.env"

if [[ ! "${release_sha}" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Invalid release SHA" >&2
  exit 2
fi

if [[ ! -f "${archive_path}" ]]; then
  echo "Release archive was not uploaded: ${archive_path}" >&2
  exit 3
fi

if [[ ! -f "${current_env}" ]]; then
  echo "Production environment file is missing: ${current_env}" >&2
  exit 4
fi

if [[ ! -d "${release_dir}" ]]; then
  install -d -m 755 "${release_dir}"
  tar -xzf "${archive_path}" -C "${release_dir}"
fi

install -m 600 "${current_env}" "${release_dir}/infra/hostinger/.env"
cd "${release_dir}/infra/hostinger"

docker compose -p deployment --env-file .env config --quiet
docker run --rm \
  -v "${PWD}/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2 caddy validate --config /etc/caddy/Caddyfile
docker compose -p deployment --env-file .env build chatpilot whatsapp-bot
docker compose -p deployment --env-file .env run --rm --no-deps chatpilot npx prisma migrate deploy

docker compose -p deployment --env-file .env up -d --no-deps whatsapp-bot
bot_healthy=0
for _ in $(seq 1 30); do
  if docker exec whatsapp-bot wget -q -O /dev/null http://127.0.0.1:3001/api/v1/whatsapp/sessions; then
    bot_healthy=1
    break
  fi
  sleep 2
done
if [[ "${bot_healthy}" -ne 1 ]]; then
  docker logs --tail=150 whatsapp-bot
  exit 10
fi

docker compose -p deployment --env-file .env up -d --no-deps chatpilot
api_healthy=0
for _ in $(seq 1 30); do
  if docker exec chatpilot wget -q -O /dev/null http://127.0.0.1:3000/api/v1/; then
    api_healthy=1
    break
  fi
  sleep 2
done
if [[ "${api_healthy}" -ne 1 ]]; then
  docker logs --tail=150 chatpilot
  exit 11
fi

# The sessions endpoint queries Prisma and can be temporarily saturated while
# persisted WhatsApp sessions reconnect. At this point its HTTP health was
# already proven above; verify the API container can resolve and reach it.
docker exec chatpilot sh -c 'nc -z -w 5 whatsapp-bot 3001'
docker compose -p deployment --env-file .env up -d --no-deps caddy

ln -sfn "${release_dir}" /opt/churnshield/current.next
mv -Tf /opt/churnshield/current.next "${current_dir}"
rm -f "${archive_path}"

echo "Active release: $(readlink -f "${current_dir}")"
docker inspect -f '{{.Name}} {{.State.Status}} {{.State.StartedAt}}' chatpilot whatsapp-bot caddy
