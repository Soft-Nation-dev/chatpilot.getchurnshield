# Meta live setup and test

ChatPilot runs on Docker Compose behind Caddy. Do not install PM2 or Nginx and
do not run `npm install` on the VPS host.

## Production endpoints

- Frontend: `https://chatpilot.trygetchurnshield.com`
- OAuth redirect: `https://api.trygetchurnshield.com/api/v1/social/oauth/facebook/callback`
- Webhook callback: `https://api.trygetchurnshield.com/api/v1/webhook/meta`

The App ID and App Secret are stored only in the protected Hostinger `.env`.
The Page access token is obtained through OAuth and encrypted in PostgreSQL; it
is not a global server environment variable.

## Get the webhook verification token

SSH into the VPS and run:

```bash
docker exec chatpilot printenv META_VERIFY_TOKEN
```

Paste the returned value into Meta's **Verify token** field. Do not commit it or
share it in screenshots.

## Meta dashboard configuration

1. Open the Meta app and add/configure Facebook Login, Messenger, Instagram,
   and Webhooks for the app's business use case.
2. In Facebook Login settings, enable Client OAuth Login and Web OAuth Login.
   Add the exact production OAuth redirect shown above to **Valid OAuth
   Redirect URIs**.
3. In Webhooks, configure the `Page` object with the production webhook
   callback and the generated verification token. Subscribe to `feed`,
   `messages`, and `messaging_postbacks`.
4. Configure the Instagram webhook object with the same callback and token.
   Subscribe to `comments`, `messages`, and `messaging_postbacks` where the
   dashboard makes those fields available.
5. Link an Instagram Professional account to the Facebook Page in Meta
   Business Suite. The connecting Facebook user must have full Page access.
6. For a development-mode test, add every test Facebook/Instagram account as
   an app admin, developer, or tester and accept the invitation. For real
   public users, switch the app to Live and complete Meta App Review/business
   verification for the permissions requested by the application.

The OAuth flow requests:

```text
business_management
pages_show_list
pages_read_engagement
pages_read_user_content
pages_manage_engagement
pages_manage_metadata
pages_manage_posts
pages_messaging
instagram_basic
instagram_content_publish
instagram_manage_comments
instagram_manage_messages
```

`instagram_manage_messages` is an OAuth permission, not a webhook field.

## Connect from ChatPilot

1. Sign in as the company owner.
2. Open **Settings → Facebook & Instagram**.
3. Select **Connect with Facebook**, choose the Page, and approve all requested
   permissions.
4. Confirm that the Page and linked Instagram account show **Active** and
   **Webhook Subscribed**.

During OAuth, ChatPilot subscribes the Page to `feed`, `messages`, and
`messaging_postbacks`, and subscribes the linked Instagram professional account
to `comments`, `messages`, and `messaging_postbacks`.

The manual Page-token form is a fallback only. Prefer OAuth so ChatPilot can
obtain the correct Page token and subscribe the Page automatically.

## Live test

Tail the API log before posting the test comment:

```bash
cd /opt/churnshield/current/infra/hostinger
docker compose -p deployment --env-file .env logs -f --tail=100 chatpilot
```

Post a property and add a buying-intent comment from a different test account,
for example: `How much is this property and is it still available?`

Expected first stage:

1. Meta POSTs the signed event to the webhook.
2. ChatPilot stores a `social_events` row.
3. The intent classifier marks it as buying intent.
4. ChatPilot replies to the comment with a `wa.me` link and a reference code.

Inspect the latest events without exposing access tokens:

```bash
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -x -c "SELECT id, platform, event_type, action, ref_code, wa_link, error, created_at FROM social_events ORDER BY id DESC LIMIT 10;"'
```

Expected second stage:

1. Open the generated WhatsApp link and send its prefilled message.
2. The normal WhatsApp pipeline creates or updates the contact.
3. ChatPilot changes the social event to `converted` and records the contact's
   source/reference, making the prospect visible in Contacts/Chats.

Inspect recent attributed contacts:

```bash
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -x -c "SELECT id, name, phone, source, source_ref, social_event_id, created_at FROM contacts WHERE social_event_id IS NOT NULL ORDER BY id DESC LIMIT 10;"'
```

A social comment does not immediately create a row in the separate sourced
`leads` table. Conversion is recorded when the prospect sends the referenced
WhatsApp message.
