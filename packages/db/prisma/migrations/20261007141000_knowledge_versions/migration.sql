BEGIN;
ALTER TABLE "KnowledgeEntry" ADD COLUMN "rootId" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
-- Preserve existing content; only initialize newly added lineage fields.
ALTER TABLE "KnowledgeEntry" DISABLE TRIGGER knowledge_retention;
UPDATE "KnowledgeEntry" SET "rootId" = "id";
ALTER TABLE "KnowledgeEntry" ENABLE TRIGGER knowledge_retention;
ALTER TABLE "KnowledgeEntry" ALTER COLUMN "rootId" SET NOT NULL;
CREATE UNIQUE INDEX "KnowledgeEntry_rootId_version_key" ON "KnowledgeEntry"("rootId", "version");
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT knowledge_version_positive CHECK ("version" > 0);
COMMIT;
