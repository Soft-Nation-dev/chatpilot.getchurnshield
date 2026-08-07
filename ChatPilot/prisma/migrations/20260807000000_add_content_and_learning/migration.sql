-- AlterTable
ALTER TABLE "social_events" ADD COLUMN     "content_post_id" INTEGER;

-- CreateTable
CREATE TABLE "properties" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "property_type" VARCHAR(50),
    "location" VARCHAR(120),
    "state" VARCHAR(60),
    "price" BIGINT,
    "price_max" BIGINT,
    "currency" VARCHAR(8) DEFAULT 'NGN',
    "size_sqm" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "title_document" VARCHAR(60),
    "payment_plan" TEXT,
    "features" TEXT,
    "image_urls" TEXT,
    "video_url" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_posts" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "property_id" INTEGER,
    "kind" VARCHAR(30) NOT NULL,
    "topic" VARCHAR(200),
    "caption" TEXT NOT NULL,
    "hashtags" TEXT,
    "image_urls" TEXT,
    "platforms" VARCHAR(60) DEFAULT 'facebook,instagram',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "fb_post_id" VARCHAR,
    "ig_post_id" VARCHAR,
    "error" TEXT,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "wa_clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learned_guidelines" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "scope" VARCHAR(30) NOT NULL,
    "guidelines" TEXT NOT NULL,
    "sample_size" INTEGER NOT NULL DEFAULT 0,
    "won_count" INTEGER NOT NULL DEFAULT 0,
    "lost_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "learned_guidelines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_company_id_status_idx" ON "properties"("company_id", "status");
-- CreateIndex
CREATE INDEX "content_posts_company_id_status_idx" ON "content_posts"("company_id", "status");
-- CreateIndex
CREATE INDEX "content_posts_company_id_scheduled_at_idx" ON "content_posts"("company_id", "scheduled_at");
-- CreateIndex
CREATE INDEX "content_posts_fb_post_id_idx" ON "content_posts"("fb_post_id");
-- CreateIndex
CREATE INDEX "content_posts_ig_post_id_idx" ON "content_posts"("ig_post_id");
-- CreateIndex
CREATE INDEX "learned_guidelines_company_id_scope_is_active_idx" ON "learned_guidelines"("company_id", "scope", "is_active");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
