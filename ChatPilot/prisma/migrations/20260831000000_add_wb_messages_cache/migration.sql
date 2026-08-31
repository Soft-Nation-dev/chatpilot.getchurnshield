-- The ChatPilot API owns the shared database migration history. The WB
-- gateway uses this cache for Baileys getMessage fallbacks.
CREATE TABLE IF NOT EXISTS "wb_messages_cache" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wb_messages_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_wb_msg_cache_session_message"
    ON "wb_messages_cache"("sessionId", "messageId");
CREATE INDEX IF NOT EXISTS "idx_wb_msg_cache_sessionId"
    ON "wb_messages_cache"("sessionId");
CREATE INDEX IF NOT EXISTS "idx_wb_msg_cache_createdAt"
    ON "wb_messages_cache"("createdAt");
