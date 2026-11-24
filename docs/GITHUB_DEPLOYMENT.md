# GitHub production deployment

The `main` branch is the production source of truth.

- Changes under `frontend/` deploy the Cloudflare Worker through
  `.github/workflows/deploy-frontend.yml`.
- Changes under `ChatPilot/`, `WB/`, or `infra/hostinger/` deploy a versioned
  release to Hostinger through `.github/workflows/deploy-backend.yml`.
- Every push and pull request runs the API tests and builds all three apps
  through `.github/workflows/ci.yml`.

## Required GitHub Actions secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Scoped token with Workers Scripts and R2 edit access |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account that owns `churnshield-frontend` |
| `VPS_HOST` | Hostinger VPS IP or hostname |
| `VPS_USER` | SSH deployment user |
| `VPS_SSH_PRIVATE_KEY` | Dedicated, forced-command deployment key; never commit it |
| `VPS_KNOWN_HOSTS` | Pinned `known_hosts` line for the VPS |

Backend application credentials remain only in
`/opt/churnshield/current/infra/hostinger/.env` on the VPS. Each release copies
that protected file forward, so Gemini, Groq, Meta, database, Paystack and
application secrets are not duplicated in GitHub.

## Deployment behavior

The backend workflow uploads a Git archive into a SHA-named release directory,
validates Docker Compose, builds both Node services, applies Prisma migrations,
checks the WhatsApp gateway and API health, reloads Caddy, and only then changes
the `/opt/churnshield/current` symlink.

The VPS public key entry uses `restrict` and a forced command implemented in
`scripts/github-vps-gate.sh`. The Actions key cannot start an interactive shell
or run commands outside the release upload/deployment protocol.

Use **Actions → Deploy backend to Hostinger VPS → Run workflow** or
**Deploy frontend to Cloudflare Workers → Run workflow** to redeploy without a
new commit.
