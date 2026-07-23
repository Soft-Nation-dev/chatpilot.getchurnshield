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

Redis (BullMQ queues) and Postgres back the stack. Caddy fronts three subdomains
(`getchurnshield.chat-pilot.dev` → frontend, `api.…` → backend, `ws.…` → baily).

## How it works

1. A buyer comments with buying intent on the agency's FB/IG post; the AI replies with the agency's
   `wa.me` link (Meta comment integration — see the roadmap).
2. The buyer taps the link and messages the agency's WhatsApp **first** (100% inbound — ban-safe).
3. `WB` receives the message and posts it to `ChatPilot` (`/api/v1/webhook/whats-bailey`).
4. The backend matches the company by its WhatsApp number, then Gemini 2.5 Flash generates a reply,
   which is sent back through `WB`.

## Deploy

Build-from-source on the droplet via `deployment/docker-compose.yml`. See that folder for the
compose file, Caddyfile, and env template. Secrets live in `.env` files on the server (never committed).

## Notes

- Outbound cold-DM scraping (Apify) is disabled (`SCRAPING_ENABLED=false`) — the model is inbound only.
- The Meta Facebook/Instagram comment webhook is the next phase and requires a Meta app + connected page.
