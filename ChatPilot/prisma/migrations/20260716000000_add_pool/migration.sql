-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "daily_lead_limit" INTEGER DEFAULT 50,
ADD COLUMN     "pool_cursor" INTEGER NOT NULL DEFAULT -1;

-- CreateTable
CREATE TABLE "pool" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR,
    "phone" BIGINT NOT NULL,
    "email" VARCHAR,
    "website" VARCHAR,
    "address" VARCHAR,
    "source" VARCHAR,
    "source_id" VARCHAR,
    "raw_text" TEXT,
    "location_state" VARCHAR,
    "qual_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pool_phone_key" ON "pool"("phone");
