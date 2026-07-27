-- CreateTable
CREATE TABLE "social_accounts" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR NOT NULL,
    "page_id" VARCHAR,
    "ig_user_id" VARCHAR,
    "name" VARCHAR,
    "username" VARCHAR,
    "access_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMPTZ(6),
    "scopes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "subscribed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_events" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER,
    "social_account_id" INTEGER,
    "platform" VARCHAR(20) NOT NULL,
    "event_type" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR NOT NULL,
    "external_user_id" VARCHAR,
    "external_user_name" VARCHAR,
    "post_id" VARCHAR,
    "parent_id" VARCHAR,
    "text" TEXT,
    "intent" VARCHAR(20),
    "intent_score" DOUBLE PRECISION,
    "classifier" VARCHAR(20),
    "action" VARCHAR(30) NOT NULL DEFAULT 'received',
    "reply_text" TEXT,
    "wa_link" TEXT,
    "ref_code" VARCHAR(16),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "social_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_platform_external_id_key" ON "social_accounts"("platform", "external_id");

-- CreateIndex
CREATE INDEX "social_accounts_company_id_idx" ON "social_accounts"("company_id");

-- CreateIndex
CREATE INDEX "social_accounts_company_id_is_active_idx" ON "social_accounts"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "social_events_ref_code_key" ON "social_events"("ref_code");

-- CreateIndex
CREATE UNIQUE INDEX "social_events_platform_external_id_key" ON "social_events"("platform", "external_id");

-- CreateIndex
CREATE INDEX "social_events_company_id_created_at_idx" ON "social_events"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "social_events_social_account_id_action_created_at_idx" ON "social_events"("social_account_id", "action", "created_at");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
