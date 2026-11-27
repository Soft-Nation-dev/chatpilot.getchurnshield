# Buyer Finder

Buyer Finder reads high-intent property enquiries from each company's connected
Facebook Pages and Instagram professional accounts, classifies them, and keeps
those opportunities exclusive to the company that owns the social account.
Public discovery is used only as a fallback for companies without a healthy
connected Meta source.
It reuses the existing Leads, Contacts, WhatsApp, AI routing, PostgreSQL, Redis,
and BullMQ infrastructure.

## Safety model

Buyer Finder has separate controls for connected accounts and paid fallback:

1. `BUYER_FINDER_ENABLED=true` permits Buyer Finder jobs and connected Meta
   account reads globally.
2. Each company must enable Buyer Finder in its dashboard settings.
3. `SCRAPING_ENABLED=true` plus `APIFY_TOKEN` permit paid public fallback.

The public fallback cannot call an Apify Actor unless all three relevant controls
are present. New company settings default to disabled and shadow mode.

Meta access tokens remain encrypted in `social_accounts`; Buyer Finder stores
only the account relationship and never copies a token into its own tables.

In shadow mode, candidates are visible for review but WhatsApp/profile outreach
actions are blocked by the API. The pilot currently enforces shadow mode on the
server even if a client submits a different value.

## Scheduled work

- Connected-account sync and public fallback discovery: Mondays at 02:15 UTC.
- Recent post and comment scan: every 30 minutes.
- Qualification: one BullMQ job per new, deduplicated comment.
- Queue concurrency: one, preventing duplicate allocations inside one deployment.
- Allocation also uses a PostgreSQL advisory transaction lock and serializable
  isolation, preventing duplicate/excess allocation across multiple workers.
- Scan and discovery jobs retry up to three times with exponential backoff and
  persist each attempt for the dashboard status panel.

Connected sources are read through the Meta Graph API using the company's Page
token. Owned-source candidates are allocated only to that company. Posts older
than the configured window and posts below the minimum comment threshold are
ignored before comment ingestion.

## AI routing

Buyer Finder uses the dedicated `buyer-finder` workload. Its provider order is:

1. Cloudflare AI
2. Groq

Gemini is deliberately excluded so its quota remains available for live chat.
Deterministic intent rules remain available if both providers are unavailable.

## Lagos shadow pilot

1. Deploy the migration and application with global flags set to `false`.
2. Open Buyer Finder and select Lagos.
3. Enable discovery and leave Shadow review on.
4. Confirm the client's Facebook/Instagram accounts show as healthy sources.
5. Set `BUYER_FINDER_ENABLED=true` to scan connected accounts.
6. Only if public fallback is wanted, add `APIFY_TOKEN`, verify the Actor IDs,
   and set `SCRAPING_ENABLED=true`.
7. Review the first 100 candidates for accuracy, duplicates, source quality, and
   cost before disabling Shadow review.

The discovery switch saves immediately. Receiving companies get an in-app
notification for each newly allocated high-intent candidate. Reviewers can mark
results as Contacted, Dismissed, Wrong Match, or Do Not Contact; the latter two
are stored as auditable feedback events.

Recommended pilot limits:

- 15 monitored accounts per state
- 10 recent posts per account
- 50 comments per eligible post
- one allocated company per candidate
- 25 user-initiated outreach actions per day

## Required backend environment variables

```env
SCRAPING_ENABLED=false
BUYER_FINDER_ENABLED=false
APIFY_TOKEN=
APIFY_FB_COMMENTS_ACTOR=apify/facebook-comments-scraper
BUYER_FINDER_MAX_ACCOUNTS_PER_STATE=15
BUYER_FINDER_MAX_POSTS_PER_ACCOUNT=10
BUYER_FINDER_MAX_COMMENTS_PER_POST=50
```

Do not place the Apify token in GitHub source files or frontend environment
variables. Store it only in the backend deployment secret store.
