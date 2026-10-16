ALTER TABLE "contacts"
  ADD COLUMN "chat_state" VARCHAR(32) NOT NULL DEFAULT 'NEW',
  ADD COLUMN "chat_state_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "state_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "state_change_reason" VARCHAR(240),
  ADD COLUMN "follow_up_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "follow_up_due_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_customer_message_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_automated_message_at" TIMESTAMPTZ(6);

UPDATE "contacts"
SET
  "chat_state" = CASE
    WHEN "crm_appointment_id" IS NOT NULL THEN 'INSPECTION_BOOKED'
    WHEN "needs_review" = TRUE OR "is_replies_activated" = FALSE THEN 'HUMAN_TAKEOVER'
    WHEN "qual_stage" = 'qualified' THEN 'QUALIFIED'
    WHEN "total_messages" > 0 THEN 'QUALIFYING'
    ELSE 'NEW'
  END,
  "last_customer_message_at" = "last_message_received",
  "follow_up_count" = LEAST("follow_up_stage", 1),
  "follow_up_due_at" = CASE
    WHEN "crm_appointment_id" IS NULL AND "follow_up_stage" = 0
      THEN "last_message_received" + INTERVAL '24 hours'
    ELSE NULL
  END;

CREATE TABLE "chat_state_transitions" (
  "id" SERIAL NOT NULL,
  "company_id" INTEGER NOT NULL,
  "contact_id" INTEGER NOT NULL,
  "from_state" VARCHAR(32) NOT NULL,
  "to_state" VARCHAR(32) NOT NULL,
  "reason" VARCHAR(240),
  "actor" VARCHAR(32) NOT NULL DEFAULT 'system',
  "job_id" VARCHAR(120),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_state_transitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_events" (
  "id" SERIAL NOT NULL,
  "company_id" INTEGER NOT NULL,
  "contact_id" INTEGER,
  "job_type" VARCHAR(40) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "max_attempts" INTEGER NOT NULL DEFAULT 1,
  "job_id" VARCHAR(120),
  "provider" VARCHAR(40),
  "latency_ms" INTEGER,
  "error_code" VARCHAR(80),
  "error_message" TEXT,
  "details" JSONB,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "automation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contacts_company_id_chat_state_last_message_received_idx" ON "contacts"("company_id", "chat_state", "last_message_received");
CREATE INDEX "contacts_chat_state_follow_up_due_at_idx" ON "contacts"("chat_state", "follow_up_due_at");
CREATE INDEX "chat_state_transitions_contact_id_created_at_idx" ON "chat_state_transitions"("contact_id", "created_at");
CREATE INDEX "chat_state_transitions_company_id_created_at_idx" ON "chat_state_transitions"("company_id", "created_at");
CREATE INDEX "automation_events_company_id_started_at_idx" ON "automation_events"("company_id", "started_at");
CREATE INDEX "automation_events_contact_id_started_at_idx" ON "automation_events"("contact_id", "started_at");
CREATE INDEX "automation_events_status_started_at_idx" ON "automation_events"("status", "started_at");
CREATE INDEX "automation_events_job_id_idx" ON "automation_events"("job_id");

ALTER TABLE "chat_state_transitions" ADD CONSTRAINT "chat_state_transitions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_state_transitions" ADD CONSTRAINT "chat_state_transitions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
