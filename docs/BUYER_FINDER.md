# Buyer Finder

Buyer Finder discovers high-intent public property enquiries, classifies them,
and allocates each qualified opportunity to an eligible GetChurnShield company.
It reuses the existing Leads, Contacts, WhatsApp, AI routing, PostgreSQL, Redis,
and BullMQ infrastructure.

## Safety model

Buyer Finder has three independent controls:

1. `SCRAPING_ENABLED=true` permits outbound scraper calls globally.
2. `BUYER_FINDER_ENABLED=true` permits Buyer Finder jobs globally.
3. Each company must enable Buyer Finder in its dashboard settings.

Both environment switches and the company switch must be enabled before an
Apify Actor can run. New company settings default to disabled and shadow mode.

In shadow mode, candidates are visible for review but WhatsApp/profile outreach
actions are blocked by the API. This must remain enabled for the first pilot.

## Scheduled work

- Account discovery: Mondays at 02:15 UTC.
- Recent post and comment scan: every 30 minutes.
- Qualification: one BullMQ job per new, deduplicated comment.
- Queue concurrency: one, preventing duplicate allocations inside one deployment.

Posts older than the configured window and posts below the minimum comment
threshold are ignored before comment scraping.

## AI routing

Buyer Finder uses the dedicated `buyer-finder` workload. Its provider order is:

1. Cloudflare AI
2. Groq

Gemini is deliberately excluded so its quota remains available for live chat.
Deterministic intent rules remain available if both providers are unavailable.

## Lagos shadow pilot

1. Deploy the migration and application with both global flags set to `false`.
2. Open Buyer Finder and select Lagos.
3. Enable discovery and leave Shadow review on.
4. Add `APIFY_TOKEN` to the backend environment.
5. Verify the configured Actor IDs with a small run in Apify Console.
6. Set `SCRAPING_ENABLED=true` and `BUYER_FINDER_ENABLED=true`.
7. Review the first 100 candidates for accuracy, duplicates, source quality, and
   cost before disabling Shadow review.

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
