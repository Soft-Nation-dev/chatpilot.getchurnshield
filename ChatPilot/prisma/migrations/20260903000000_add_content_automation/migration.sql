CREATE TABLE "content_automation_settings" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "posts_per_day" INTEGER NOT NULL DEFAULT 2,
    "posting_times" JSONB,
    "posting_days" JSONB,
    "platforms" VARCHAR(60) NOT NULL DEFAULT 'facebook,instagram',
    "approval_required" BOOLEAN NOT NULL DEFAULT true,
    "property_ratio" INTEGER NOT NULL DEFAULT 100,
    "min_reuse_days" INTEGER NOT NULL DEFAULT 14,
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'Africa/Lagos',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_automation_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_automation_settings_company_id_key"
ON "content_automation_settings"("company_id");

ALTER TABLE "content_automation_settings"
ADD CONSTRAINT "content_automation_settings_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
