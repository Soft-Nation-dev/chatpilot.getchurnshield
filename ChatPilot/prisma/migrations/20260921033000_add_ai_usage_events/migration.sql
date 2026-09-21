CREATE TABLE "ai_usage_events" (
  "id" SERIAL NOT NULL,
  "company_id" INTEGER,
  "contact_id" INTEGER,
  "workload" VARCHAR(40) NOT NULL,
  "provider" VARCHAR(30) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_units" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "latency_ms" INTEGER NOT NULL DEFAULT 0,
  "fallback_index" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(40),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_events_provider_created_at_idx"
  ON "ai_usage_events"("provider", "created_at");
CREATE INDEX "ai_usage_events_company_id_created_at_idx"
  ON "ai_usage_events"("company_id", "created_at");
CREATE INDEX "ai_usage_events_workload_created_at_idx"
  ON "ai_usage_events"("workload", "created_at");
