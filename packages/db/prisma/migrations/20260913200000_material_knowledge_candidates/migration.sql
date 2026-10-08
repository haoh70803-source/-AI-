ALTER TYPE "EvidenceType" ADD VALUE 'ORGANIZATION';
ALTER TYPE "EvidenceType" ADD VALUE 'PRODUCT_SERVICE';
ALTER TYPE "EvidenceType" ADD VALUE 'COMMERCIAL_COMMITMENT';
ALTER TYPE "PromptType" ADD VALUE 'MATERIAL_KNOWLEDGE_EXTRACTION';
CREATE TYPE "EvidenceOwnership" AS ENUM ('OWN', 'EXTERNAL', 'UNKNOWN');
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

ALTER TABLE "EvidenceItem" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "EvidenceItem" ADD COLUMN "ownership" "EvidenceOwnership" NOT NULL DEFAULT 'OWN';
ALTER TABLE "EvidenceItem" ADD COLUMN "status" "EvidenceStatus" NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "EvidenceItem" ADD COLUMN "locator" JSONB;
ALTER TABLE "EvidenceItem" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "EvidenceItem" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "EvidenceItem" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "EvidenceItem" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "EvidenceItem" ADD COLUMN "rejectedById" TEXT;
ALTER TABLE "EvidenceItem" ADD COLUMN "rejectedAt" TIMESTAMP(3);

UPDATE "EvidenceItem" SET "ownership" = 'EXTERNAL' WHERE "sourceItemId" IS NOT NULL;
CREATE UNIQUE INDEX "EvidenceItem_dedupeKey_key" ON "EvidenceItem"("dedupeKey");
CREATE INDEX "EvidenceItem_workspaceId_sourceItemId_status_idx" ON "EvidenceItem"("workspaceId", "sourceItemId", "status");
CREATE INDEX "EvidenceItem_projectId_ownership_status_idx" ON "EvidenceItem"("projectId", "ownership", "status");
CREATE INDEX "EvidenceItem_confirmedById_idx" ON "EvidenceItem"("confirmedById");
CREATE INDEX "EvidenceItem_rejectedById_idx" ON "EvidenceItem"("rejectedById");
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
