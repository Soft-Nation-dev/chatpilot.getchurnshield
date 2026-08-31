# Real-Estate WhatsApp AI Engine

A multi-tenant platform that turns buying-intent comments on Facebook/Instagram into inbound WhatsApp
conversations, where an AI sales rep (Google Gemini 2.5 Flash) qualifies each buyer for the agency.

## Architecture

The production stack is three services, orchestrated by `deployment/`:

| Service   | Path         | Stack                | Role                                                        |
|-----------|--------------|----------------------|------------------------------------------------------------|
| backend   | `ChatPilot`  | NestJS + Prisma + Postgres + BullMQ | API, AI replies, company/lead/contact management |
| frontend  | `frontend`   | Next.js 14          | Agency dashboard + admin console                            |
| baily     | `WB`         | NestJS + Baileys    | WhatsApp gateway (send/receive, session management)         |

Redis (BullMQ queues) and Postgres back the stack. Cloudflare serves
`chatpilot.trygetchurnshield.com`, Caddy serves `api.trygetchurnshield.com`,
and the WhatsApp gateway stays private inside Docker.

## How it works

1. A buyer comments with buying intent on the agency's FB/IG post; the AI replies with the agency's
   `wa.me` link (Meta comment integration — see the roadmap).
2. The buyer taps the link and messages the agency's WhatsApp **first** (100% inbound — ban-safe).
3. `WB` receives the message and posts it to `ChatPilot` (`/api/v1/webhook/whats-bailey`).
4. The backend matches the company by its WhatsApp number, then Gemini 2.5 Flash generates a reply,
   which is sent back through `WB`.

## Deploy

The frontend deploys to Cloudflare from GitHub Actions. Hostinger runs the API and the separate
WhatsApp gateway. See [`docs/HOSTINGER_DEPLOYMENT.md`](docs/HOSTINGER_DEPLOYMENT.md) for the required services,
environment variables, and safe rollout commands. Secrets live in `.env` files on the server
(never committed).

## Notes

- Outbound cold-DM scraping (Apify) is disabled (`SCRAPING_ENABLED=false`) — the model is inbound only.
- Meta Facebook/Instagram connections require a configured Meta app and a connected Page.
