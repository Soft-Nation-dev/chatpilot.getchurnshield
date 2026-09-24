-- Remove retry duplicates before enforcing the same invariant for new events.
DELETE FROM "messages" a
USING "messages" b
WHERE a."wb_id" IS NOT NULL
  AND a."contact_id" = b."contact_id"
  AND a."wb_id" = b."wb_id"
  AND a."id" > b."id";

CREATE UNIQUE INDEX "messages_contact_id_wb_id_key"
ON "messages"("contact_id", "wb_id");
