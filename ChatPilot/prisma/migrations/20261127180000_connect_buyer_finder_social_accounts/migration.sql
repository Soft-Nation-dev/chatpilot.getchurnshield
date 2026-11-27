ALTER TABLE "buyer_finder_accounts"
ADD COLUMN "company_id" INTEGER,
ADD COLUMN "social_account_id" INTEGER,
ADD COLUMN "source" VARCHAR(24) NOT NULL DEFAULT 'public';

CREATE UNIQUE INDEX "buyer_finder_accounts_social_account_id_key"
ON "buyer_finder_accounts"("social_account_id");

CREATE INDEX "buyer_finder_accounts_company_id_source_status_idx"
ON "buyer_finder_accounts"("company_id", "source", "status");

ALTER TABLE "buyer_finder_accounts"
ADD CONSTRAINT "buyer_finder_accounts_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "buyer_finder_accounts"
ADD CONSTRAINT "buyer_finder_accounts_social_account_id_fkey"
FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
