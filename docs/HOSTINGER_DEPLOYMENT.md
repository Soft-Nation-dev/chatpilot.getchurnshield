# Hostinger production deployment

The Cloudflare-hosted frontend is deployed independently by GitHub Actions. Hostinger must run the two backend services that power it:

- `ChatPilot`: the API, AI logic, and PostgreSQL-backed business data.
- `WB`: the persistent Baileys/WhatsApp gateway that creates QR and pairing codes.

Redis and PostgreSQL must also be reachable by the API. `WB` needs PostgreSQL so WhatsApp credentials survive restarts.

## Data ownership

Business descriptions belong in PostgreSQL in `companies.business_details`. They must not be stored only in the browser or in Cloudflare because the API and AI assistant need the same durable, tenant-scoped data. Cloudflare should serve the frontend; Hostinger/PostgreSQL should remain the system of record.

## Required production variables

In the `ChatPilot` environment:

```dotenv
NODE_ENV=production
FRONTEND_URL=https://chatpilot.trygetchurnshield.com
PUBLIC_BASE_URL=https://api.trygetchurnshield.com
WB_BASE_URL=http://whatsapp-bot:3001
```

The tracked production template is in `infra/hostinger`. Both services use the
same PostgreSQL database, but only ChatPilot runs Prisma migrations. `WB` must
not run its separate migration history against the shared database.

In the `WB` environment:

```dotenv
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://...
WEBHOOK_URL=http://chatpilot:3000/api/v1/webhook/whats-bailey
ENABLE_MESSAGE_RECEIPT=true
```

`chatpilot` and `whatsapp-bot` above are Docker Compose service names. If your services use different names, update the URLs. Do not expose the WB port publicly; only the API needs to reach it over the private Docker network.

Meta connections additionally require these variables in `ChatPilot`:

```dotenv
META_APP_ID=...
META_APP_SECRET=...
META_VERIFY_TOKEN=...
META_OAUTH_REDIRECT_URI=https://api.trygetchurnshield.com/api/v1/social/oauth/facebook/callback
```

## Compose stack

Use `infra/hostinger/docker-compose.yml`. It preserves the existing named
volumes (`pgdata`, `redisdata`, and `uploads`) and adds `whatsapp-bot` only on
the private Compose network.

## Deploy after merging changes

Run these commands over SSH from the directory containing this repository and your production Compose file:

```bash
git pull origin main
cd infra/hostinger
docker compose build chatpilot whatsapp-bot
docker compose run --rm chatpilot npx prisma migrate deploy
docker compose up -d chatpilot whatsapp-bot
docker compose ps
docker compose logs --tail=150 chatpilot whatsapp-bot
```

If the existing API service has a different Compose name, replace `backend`. Avoid `docker compose down -v`; the `-v` option can delete database and session volumes.

After deployment, verify the private WB service from inside the API container:

```bash
docker compose exec chatpilot node -e "fetch('http://whatsapp-bot:3001/api/v1/whatsapp/sessions').then(r=>r.text()).then(console.log)"
```

Then sign in to the dashboard and retry QR or pairing-code connection. A working gateway returns a JSON session list to the verification command.
