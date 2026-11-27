CREATE TABLE "buyer_finder_settings" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "shadow_mode" BOOLEAN NOT NULL DEFAULT true,
    "target_states" TEXT[] NOT NULL DEFAULT ARRAY['Lagos']::TEXT[],
    "exclusivity_limit" INTEGER NOT NULL DEFAULT 1,
    "min_intent_score" INTEGER NOT NULL DEFAULT 7,
    "daily_outreach_limit" INTEGER NOT NULL DEFAULT 25,
    "post_max_age_hours" INTEGER NOT NULL DEFAULT 48,
    "min_post_comments" INTEGER NOT NULL DEFAULT 3,
    "scan_interval_minutes" INTEGER NOT NULL DEFAULT 30,
    "account_discovery_interval_days" INTEGER NOT NULL DEFAULT 7,
    "last_discovery_at" TIMESTAMPTZ(6),
    "last_scan_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "buyer_finder_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyer_finder_accounts" (
    "id" SERIAL NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(180) NOT NULL,
    "profile_url" TEXT NOT NULL,
    "display_name" TEXT,
    "handle" VARCHAR(180),
    "states" TEXT[] NOT NULL,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "account_type" VARCHAR(30),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "last_scanned_at" TIMESTAMPTZ(6),
    "discovered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "buyer_finder_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyer_finder_posts" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER,
    "platform" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(220) NOT NULL,
    "post_url" TEXT NOT NULL,
    "caption" TEXT,
    "property_type" VARCHAR(120),
    "specific_location" VARCHAR(180),
    "published_at" TIMESTAMPTZ(6),
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "context_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "eligible_until" TIMESTAMPTZ(6),
    "last_comments_scan_at" TIMESTAMPTZ(6),
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "buyer_finder_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyer_finder_comments" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(220) NOT NULL,
    "author_external_id" VARCHAR(220),
    "author_name" TEXT,
    "author_handle" VARCHAR(180),
    "author_profile_url" TEXT,
    "author_bio" TEXT,
    "comment_text" TEXT NOT NULL,
    "phone_normalized" BIGINT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "commented_at" TIMESTAMPTZ(6),
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "buyer_finder_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyer_finder_candidates" (
    "id" SERIAL NOT NULL,
    "comment_id" INTEGER NOT NULL,
    "is_high_intent" BOOLEAN NOT NULL DEFAULT false,
    "intent_score" INTEGER NOT NULL DEFAULT 0,
    "intent_reason" VARCHAR(240),
    "classifier" VARCHAR(40),
    "channel" VARCHAR(24) NOT NULL,
    "phone_normalized" BIGINT,
    "profile_url" TEXT,
    "location_state" VARCHAR(80),
    "dm_script" TEXT,
    "whatsapp_script" TEXT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'qualified',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "buyer_finder_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyer_finder_allocations" (
    "id" SERIAL NOT NULL,
    "candidate_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "lead_id" INTEGER,
    "status" VARCHAR(24) NOT NULL DEFAULT 'allocated',
    "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contacted_at" TIMESTAMPTZ(6),
    "dismissed_at" TIMESTAMPTZ(6),
    CONSTRAINT "buyer_finder_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyer_finder_outreach_events" (
    "id" SERIAL NOT NULL,
    "allocation_id" INTEGER NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "channel" VARCHAR(24),
    "script" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "buyer_finder_outreach_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "buyer_finder_settings_company_id_key" ON "buyer_finder_settings"("company_id");
CREATE INDEX "buyer_finder_settings_enabled_shadow_mode_idx" ON "buyer_finder_settings"("enabled", "shadow_mode");
CREATE UNIQUE INDEX "buyer_finder_accounts_platform_external_id_key" ON "buyer_finder_accounts"("platform", "external_id");
CREATE INDEX "buyer_finder_accounts_platform_status_idx" ON "buyer_finder_accounts"("platform", "status");
CREATE UNIQUE INDEX "buyer_finder_posts_platform_external_id_key" ON "buyer_finder_posts"("platform", "external_id");
CREATE INDEX "buyer_finder_posts_platform_published_at_idx" ON "buyer_finder_posts"("platform", "published_at");
CREATE INDEX "buyer_finder_posts_eligible_until_last_comments_scan_at_idx" ON "buyer_finder_posts"("eligible_until", "last_comments_scan_at");
CREATE UNIQUE INDEX "buyer_finder_comments_platform_external_id_key" ON "buyer_finder_comments"("platform", "external_id");
CREATE INDEX "buyer_finder_comments_status_created_at_idx" ON "buyer_finder_comments"("status", "created_at");
CREATE INDEX "buyer_finder_comments_post_id_created_at_idx" ON "buyer_finder_comments"("post_id", "created_at");
CREATE UNIQUE INDEX "buyer_finder_candidates_comment_id_key" ON "buyer_finder_candidates"("comment_id");
CREATE INDEX "buyer_finder_candidates_is_high_intent_location_state_created_at_idx" ON "buyer_finder_candidates"("is_high_intent", "location_state", "created_at");
CREATE INDEX "buyer_finder_candidates_channel_created_at_idx" ON "buyer_finder_candidates"("channel", "created_at");
CREATE UNIQUE INDEX "buyer_finder_allocations_candidate_id_company_id_key" ON "buyer_finder_allocations"("candidate_id", "company_id");
CREATE INDEX "buyer_finder_allocations_company_id_status_allocated_at_idx" ON "buyer_finder_allocations"("company_id", "status", "allocated_at");
CREATE INDEX "buyer_finder_allocations_candidate_id_allocated_at_idx" ON "buyer_finder_allocations"("candidate_id", "allocated_at");
CREATE INDEX "buyer_finder_outreach_events_allocation_id_created_at_idx" ON "buyer_finder_outreach_events"("allocation_id", "created_at");

ALTER TABLE "buyer_finder_settings" ADD CONSTRAINT "buyer_finder_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_finder_posts" ADD CONSTRAINT "buyer_finder_posts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "buyer_finder_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "buyer_finder_comments" ADD CONSTRAINT "buyer_finder_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "buyer_finder_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_finder_candidates" ADD CONSTRAINT "buyer_finder_candidates_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "buyer_finder_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_finder_allocations" ADD CONSTRAINT "buyer_finder_allocations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "buyer_finder_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_finder_allocations" ADD CONSTRAINT "buyer_finder_allocations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_finder_allocations" ADD CONSTRAINT "buyer_finder_allocations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "buyer_finder_outreach_events" ADD CONSTRAINT "buyer_finder_outreach_events_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "buyer_finder_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
