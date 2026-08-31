# ChurnShield frontend

Next.js frontend configured for deployment to Cloudflare Workers with the
OpenNext Cloudflare adapter.

The project uses Next.js 16, React 19, and the current OpenNext adapter.

## Local development

Create `.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=https://api.trygetchurnshield.com/api/v1
NEXT_PUBLIC_SITE_URL=http://localhost:3002
```

Then install dependencies and start Next.js:

```bash
npm install
npm run dev
```

## Cloudflare preview

Run the application locally in Cloudflare's Workers runtime:

```bash
npm run preview
```

OpenNext warns that native Windows builds are not fully supported. Prefer the
Linux GitHub Actions deployment below (or WSL) if a Windows preview fails.

## Deploy from a workstation

Authenticate Wrangler with `npx wrangler login`, set the public build
variables in your shell, and run:

```bash
npm run deploy
```

Do not run `wrangler deploy` directly. The `deploy` script builds `.open-next`
before Wrangler uploads it.

The Worker name is `churnshield-frontend`; change `name` in `wrangler.jsonc`
before the first deployment if another name is preferred.

## GitHub Actions deployment

The repository workflow deploys changes under `frontend/` when they reach
`main`. Configure these repository secrets before running it:

- Secret `CLOUDFLARE_API_TOKEN`: API token with Workers Scripts edit access.
- Secret `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.

The production API and site URLs are pinned in the workflow so stale
repository variables cannot redirect the browser to a retired backend.

Production values for the current deployment are:

```text
NEXT_PUBLIC_API_URL=https://api.trygetchurnshield.com/api/v1
NEXT_PUBLIC_SITE_URL=https://chatpilot.trygetchurnshield.com
```

The API deployment must set `FRONTEND_URL` to the same frontend origin. Meta
OAuth additionally requires `META_APP_ID`, `META_APP_SECRET`, and
`META_OAUTH_REDIRECT_URI=https://api.trygetchurnshield.com/api/v1/social/oauth/facebook/callback`.

The backend must allow browser requests from the Worker or custom-domain
origin through its CORS configuration.
