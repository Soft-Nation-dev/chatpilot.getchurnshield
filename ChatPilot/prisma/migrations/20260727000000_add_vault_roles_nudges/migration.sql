-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "wa_inbound_phone" BIGINT,
ADD COLUMN     "social_reply_enabled" BOOLEAN DEFAULT true,
ADD COLUMN     "social_reply_template" TEXT,
ADD COLUMN     "vertical" VARCHAR(30),
ADD COLUMN     "timezone" VARCHAR(60),
ADD COLUMN     "locale" VARCHAR(10);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" VARCHAR(20) NOT NULL DEFAULT 'owner',
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'active',
ADD COLUMN     "revoked_at" TIMESTAMPTZ(6),
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invited_by" INTEGER,
ADD COLUMN     "invite_token" VARCHAR(128),
ADD COLUMN     "invite_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "last_login_at" TIMESTAMPTZ(6),
ADD COLUMN     "can_view_contact_phone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "full_name" VARCHAR;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "budget_min" BIGINT,
ADD COLUMN     "budget_max" BIGINT,
ADD COLUMN     "budget_currency" VARCHAR(8) DEFAULT 'NGN',
ADD COLUMN     "budget_raw" TEXT,
ADD COLUMN     "property_type" VARCHAR(50),
ADD COLUMN     "preferred_location" VARCHAR(120),
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "title_preference" VARCHAR(60),
ADD COLUMN     "purchase_timeline" VARCHAR(30),
ADD COLUMN     "payment_plan" VARCHAR(30),
ADD COLUMN     "qualification_notes" TEXT,
ADD COLUMN     "qual_stage" VARCHAR(20) NOT NULL DEFAULT 'new',
ADD COLUMN     "lead_score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" VARCHAR(30),
ADD COLUMN     "source_ref" VARCHAR(40),
ADD COLUMN     "social_event_id" INTEGER,
ADD COLUMN     "assigned_user_id" INTEGER,
ADD COLUMN     "follow_up_stage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_follow_up_at" TIMESTAMPTZ(6);

-- Backfill: contacts that already received the 24h nudge must not be nudged again
UPDATE "contacts" SET "follow_up_stage" = 1 WHERE "is_follow_up_sent" = true;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(40),
    "entity_id" VARCHAR(40),
    "meta" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_company_id_status_idx" ON "users"("company_id", "status");

-- CreateIndex
CREATE INDEX "users_invite_token_idx" ON "users"("invite_token");

-- CreateIndex
CREATE INDEX "contacts_company_id_qual_stage_idx" ON "contacts"("company_id", "qual_stage");

-- CreateIndex
CREATE INDEX "contacts_company_id_source_idx" ON "contacts"("company_id", "source");

-- CreateIndex
CREATE INDEX "contacts_source_ref_idx" ON "contacts"("source_ref");

-- CreateIndex
CREATE INDEX "contacts_company_id_follow_up_stage_last_message_received_idx" ON "contacts"("company_id", "follow_up_stage", "last_message_received");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_action_idx" ON "audit_logs"("company_id", "action");
