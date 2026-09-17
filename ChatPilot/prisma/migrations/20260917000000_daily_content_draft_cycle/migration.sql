ALTER TABLE "content_posts"
ADD COLUMN "automation_generated" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "content_posts_company_id_automation_generated_status_scheduled_at_idx"
ON "content_posts"("company_id", "automation_generated", "status", "scheduled_at");
