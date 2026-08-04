# ChurnShield frontend

Next.js frontend configured for deployment to Cloudflare Workers with the
OpenNext Cloudflare adapter.

The project uses Next.js 16, React 19, and the current OpenNext adapter.

## Local development

Create `.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=https://your-api.example.com/api/v1
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
`main`. Configure these repository settings before running it:

- Secret `CLOUDFLARE_API_TOKEN`: API token with Workers Scripts edit access.
- Secret `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
- Variable `NEXT_PUBLIC_API_URL`: public API base URL, including `/api/v1` if
  that is how the backend is mounted.
- Variable `NEXT_PUBLIC_SITE_URL`: final frontend URL.

The backend must allow browser requests from the Worker or custom-domain
origin through its CORS configuration.
