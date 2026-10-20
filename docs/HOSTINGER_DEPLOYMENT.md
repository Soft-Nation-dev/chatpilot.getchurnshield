# Hostinger production deployment

## One-command production deployment

From the repository root, run:

```powershell
npm run deploy
```

The command refuses tracked uncommitted changes, runs the complete backend
test/build and frontend build, pushes the release commit, verifies the pinned
VPS host key, deploys and migrates the Hostinger API without restarting the
WhatsApp container, deploys the OpenNext frontend and R2 media routes to
Cloudflare, then checks both public production URLs.

## Current production access and layout

Use this section for future deployments so the server does not need to be
rediscovered each time.

- VPS hostname: `srv2001947.hstgr.cloud` (`179.198.209.152`)
- Hostinger plan/image: KVM 1, Ubuntu 24.04 with Docker
- SSH user: `root`
- Host key fingerprint: `SHA256:EZbYjvOX7av3mN2h1xt4YBSA+zUXGBGnt6d2oU22Iqc`
- Hostinger SSH-key label: `chatpilot-kvm1-deploy`
- Local private-key path on the deployment PC:
  `C:\Users\HP\.ssh\chatpilot-kvm1-deploy`
- Active release symlink: `/opt/churnshield/current`
- Immutable releases: `/opt/churnshield/releases/<short-git-sha>`
- Shared infrastructure Compose directory: `/opt/churnshield/deployment`
- Memory safety: a persistent 4 GB swap file is enabled at `/swapfile`

The previous KVM 2 host, `srv1926036.hstgr.cloud` (`185.230.64.44`), is a
temporary rollback source only. Do not deploy new releases to it. Keep it
online until the KVM 1 migration has been observed in production and the owner
explicitly approves retirement.

The SSH private key and API-provider credentials must never be copied into this
repository. Keep `chatpilot-kvm1-deploy` installed until it is replaced
with another verified deployment key. Provider credentials live only in the
active release's `infra/hostinger/.env` file.

The shared Compose directory owns Caddy, PostgreSQL, Redis, and their persistent
volumes. The active release's `infra/hostinger/docker-compose.yml` owns the
`chatpilot` and `whatsapp-bot` application containers under the same
`deployment` Compose project. Never run `docker compose down -v`.

## Repeatable release deployment

Production is release-based rather than a Git checkout. For backend changes:

1. Verify the desired commit locally and run the full test/build suite.
2. Create a tracked-files-only archive with `git archive`.
3. Upload it over SFTP and extract it to
   `/opt/churnshield/releases/<short-git-sha>`.
4. Copy `/opt/churnshield/current/infra/hostinger/.env` to the new release,
   preserving mode `0600`. Add or update secrets there only; never put them in
   the archive or shell output.
5. From the new release's `infra/hostinger` directory, run:

```bash
docker compose -p deployment --env-file .env config --quiet
docker compose -p deployment --env-file .env build chatpilot
docker compose -p deployment --env-file .env run --rm --no-deps chatpilot npx prisma migrate deploy
docker compose -p deployment --env-file .env up -d --no-deps chatpilot
```

6. Verify the new API container internally before changing the active symlink:

```bash
docker exec chatpilot node -e "fetch('http://127.0.0.1:3000/api/v1/').then(r => { if (!r.ok) process.exit(1) })"
```

7. Atomically point `current` to the verified release:

```bash
ln -sfn /opt/churnshield/releases/<short-git-sha> /opt/churnshield/current.next
mv -Tf /opt/churnshield/current.next /opt/churnshield/current
```

8. Confirm the public API and private WhatsApp gateway. The WhatsApp container
   should retain its earlier start time when only `chatpilot` was changed:

```bash
curl -fsS -o /dev/null https://api.trygetchurnshield.com/api/v1/
docker exec chatpilot node -e "fetch('http://whatsapp-bot:3001/api/v1/whatsapp/sessions').then(r => { if (!r.ok) process.exit(1); console.log('WhatsApp gateway OK') })"
docker compose -p deployment --env-file .env ps
docker compose -p deployment --env-file .env logs --tail=150 chatpilot
```

Commit `44c5c69` was deployed successfully with this process on 21 September
2026. It added the Cloudflare Workers AI → Groq → Gemini routing and the
`20260921033000_add_ai_usage_events` migration.

Commit `d6236ae` was migrated to KVM 1 on 23 September 2026. PostgreSQL, Redis,
the uploads volume, and WhatsApp session data were restored from the verified
KVM 2 backup. The public API DNS record now points to `179.198.209.152`; it
remains DNS-only with a two-minute TTL. Caddy obtained a fresh Let's Encrypt
certificate after the cutover.

The production `CLOUDFLARE_API_TOKEN` is intentionally scoped for Workers AI
and cannot edit DNS records. Use the Cloudflare dashboard for DNS changes, or
create a separate least-privilege token restricted to DNS edits for this zone;
do not broaden or repurpose the AI token.

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
GEMINI_API_KEY=...
GROQ_API_KEY=...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_AI_GATEWAY_ID=default
```

The API routes live WhatsApp traffic through Cloudflare Workers AI first,
Groq second, and Gemini last. Background content, social reply, and learning
jobs use a cheaper Cloudflare model first. Provider credentials must remain in
the server `.env`; never add them to the Compose file or repository.

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
