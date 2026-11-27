CREATE TABLE "buyer_finder_runs" (
  "id" SERIAL NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "job_id" VARCHAR(120),
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "max_attempts" INTEGER NOT NULL DEFAULT 1,
  "summary" JSONB,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "buyer_finder_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "buyer_finder_runs_kind_started_at_idx"
ON "buyer_finder_runs"("kind", "started_at");

CREATE INDEX "buyer_finder_runs_status_started_at_idx"
ON "buyer_finder_runs"("status", "started_at");

CREATE INDEX "buyer_finder_runs_job_id_attempt_idx"
ON "buyer_finder_runs"("job_id", "attempt");
