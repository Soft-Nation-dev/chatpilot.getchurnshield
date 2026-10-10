CREATE TABLE "notifications" (
  "id" SERIAL NOT NULL,
  "company_id" INTEGER NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "severity" VARCHAR(20) NOT NULL DEFAULT 'info',
  "title" VARCHAR(160) NOT NULL,
  "message" TEXT NOT NULL,
  "entity" VARCHAR(40),
  "entity_id" VARCHAR(80),
  "dedupe_key" VARCHAR(160),
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notifications_company_id_dedupe_key_key"
  ON "notifications"("company_id", "dedupe_key");

CREATE INDEX "notifications_company_id_read_at_created_at_idx"
  ON "notifications"("company_id", "read_at", "created_at");
