ALTER TABLE "companies"
  ADD COLUMN "account_status" VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN "subscription_plan" VARCHAR(30) NOT NULL DEFAULT 'trial',
  ADD COLUMN "subscription_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN "subscription_started_at" TIMESTAMPTZ(6),
  ADD COLUMN "subscription_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "suspended_at" TIMESTAMPTZ(6),
  ADD COLUMN "suspension_reason" TEXT;

CREATE INDEX "companies_account_status_idx"
  ON "companies"("account_status");

CREATE INDEX "companies_subscription_status_subscription_expires_at_idx"
  ON "companies"("subscription_status", "subscription_expires_at");
