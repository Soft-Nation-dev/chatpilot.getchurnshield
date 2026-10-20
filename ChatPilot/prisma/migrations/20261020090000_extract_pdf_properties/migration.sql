ALTER TABLE "company_assets"
ADD COLUMN "property_extracted_at" TIMESTAMPTZ(6),
ADD COLUMN "extracted_property_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "properties"
ADD COLUMN "source_asset_id" INTEGER,
ADD COLUMN "source_fingerprint" VARCHAR(64);

CREATE INDEX "properties_company_id_source_asset_id_idx"
ON "properties"("company_id", "source_asset_id");

CREATE UNIQUE INDEX "properties_company_id_source_asset_id_source_fingerprint_key"
ON "properties"("company_id", "source_asset_id", "source_fingerprint");
