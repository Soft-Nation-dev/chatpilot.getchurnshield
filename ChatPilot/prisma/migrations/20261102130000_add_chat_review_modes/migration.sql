ALTER TABLE "contacts"
ADD COLUMN "review_mode" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "last_human_message_at" TIMESTAMPTZ(6);

UPDATE "contacts"
SET "review_mode" = 'SOFT_REVIEW'
WHERE "chat_state" = 'HUMAN_TAKEOVER'
   OR "needs_review" = TRUE
   OR "is_replies_activated" = FALSE;

CREATE INDEX "contacts_company_id_review_mode_last_message_received_idx"
ON "contacts"("company_id", "review_mode", "last_message_received");
