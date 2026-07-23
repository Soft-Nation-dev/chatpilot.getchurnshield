-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "email" VARCHAR,
ADD COLUMN     "monthly_lead_quota" INTEGER DEFAULT 300;

-- CreateTable
CREATE TABLE "leads" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" VARCHAR,
    "phone" BIGINT,
    "email" VARCHAR,
    "website" VARCHAR,
    "address" VARCHAR,
    "source" VARCHAR,
    "source_id" VARCHAR,
    "raw_text" TEXT,
    "location_state" VARCHAR,
    "status" VARCHAR NOT NULL DEFAULT 'new',
    "qual_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_bot_activated" BOOLEAN NOT NULL DEFAULT true,
    "contact_id" INTEGER,
    "last_contact_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_requests" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 0,
    "found" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "sources" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "lead_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_company_id_status_idx" ON "leads"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_company_id_phone_key" ON "leads"("company_id", "phone");

-- CreateIndex
CREATE INDEX "lead_requests_company_id_idx" ON "lead_requests"("company_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_requests" ADD CONSTRAINT "lead_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
