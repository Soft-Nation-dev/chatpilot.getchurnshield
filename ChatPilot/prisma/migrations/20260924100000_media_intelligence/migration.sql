ALTER TABLE "company_assets"
  ADD COLUMN "mime_type" VARCHAR(120),
  ADD COLUMN "source" VARCHAR(30) NOT NULL DEFAULT 'company-upload',
  ADD COLUMN "source_ref" VARCHAR(120),
  ADD COLUMN "content_hash" VARCHAR(64),
  ADD COLUMN "ai_summary" TEXT,
  ADD COLUMN "ai_tags" TEXT,
  ADD COLUMN "indexed_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_used_at" TIMESTAMPTZ(6),
  ADD COLUMN "use_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "company_assets_company_id_file_type_indexed_at_idx"
ON "company_assets"("company_id", "file_type", "indexed_at");

CREATE INDEX "company_assets_company_id_last_used_at_idx"
ON "company_assets"("company_id", "last_used_at");

DELETE FROM "company_assets" a
USING "company_assets" b
WHERE a."company_id" = b."company_id"
  AND a."file_url" = b."file_url"
  AND a."id" > b."id";

CREATE UNIQUE INDEX "company_assets_company_id_file_url_key"
ON "company_assets"("company_id", "file_url");
