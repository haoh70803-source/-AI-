CREATE TYPE "BenchmarkCollectionRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

CREATE TABLE "BenchmarkCollectionRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "benchmarkAccountId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" "BenchmarkCollectionRunStatus" NOT NULL DEFAULT 'QUEUED',
  "rangeStart" TIMESTAMP(3) NOT NULL,
  "rangeEnd" TIMESTAMP(3) NOT NULL,
  "profileSnapshot" JSONB,
  "nextOffset" INTEGER NOT NULL DEFAULT 0,
  "pageCount" INTEGER NOT NULL DEFAULT 0,
  "seenCount" INTEGER NOT NULL DEFAULT 0,
  "inRangeCount" INTEGER NOT NULL DEFAULT 0,
  "undatedCount" INTEGER NOT NULL DEFAULT 0,
  "stopReason" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BenchmarkCollectionRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BenchmarkCollectionRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BenchmarkCollectionRun_benchmarkAccountId_fkey" FOREIGN KEY ("benchmarkAccountId") REFERENCES "BenchmarkAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BenchmarkCollectionRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "BenchmarkCollectionRun_workspaceId_benchmarkAccountId_createdAt_idx" ON "BenchmarkCollectionRun"("workspaceId", "benchmarkAccountId", "createdAt");
CREATE INDEX "BenchmarkCollectionRun_workspaceId_status_idx" ON "BenchmarkCollectionRun"("workspaceId", "status");
CREATE UNIQUE INDEX "BenchmarkCollectionRun_one_active_per_account_key" ON "BenchmarkCollectionRun"("workspaceId", "benchmarkAccountId") WHERE "status" IN ('QUEUED', 'RUNNING');

CREATE TABLE "BenchmarkCollectionRunItem" (
  "id" TEXT NOT NULL,
  "collectionRunId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "titleSnapshot" TEXT NOT NULL,
  "urlSnapshot" TEXT NOT NULL,
  "coverUrlSnapshot" TEXT,
  "metadataSnapshot" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "inRange" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenchmarkCollectionRunItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BenchmarkCollectionRunItem_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "BenchmarkCollectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BenchmarkCollectionRunItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BenchmarkContentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BenchmarkCollectionRunItem_collectionRunId_snapshotId_key" ON "BenchmarkCollectionRunItem"("collectionRunId", "snapshotId");
CREATE INDEX "BenchmarkCollectionRunItem_collectionRunId_inRange_publishedAt_idx" ON "BenchmarkCollectionRunItem"("collectionRunId", "inRange", "publishedAt");
CREATE INDEX "BenchmarkCollectionRunItem_snapshotId_idx" ON "BenchmarkCollectionRunItem"("snapshotId");

ALTER TABLE "BenchmarkMetricObservation" ADD COLUMN "collectionRunId" TEXT;
ALTER TABLE "BenchmarkStudy" ADD COLUMN "collectionRunId" TEXT;

ALTER TABLE "BenchmarkMetricObservation"
  ADD CONSTRAINT "BenchmarkMetricObservation_collectionRunId_fkey"
  FOREIGN KEY ("collectionRunId") REFERENCES "BenchmarkCollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BenchmarkStudy"
  ADD CONSTRAINT "BenchmarkStudy_collectionRunId_fkey"
  FOREIGN KEY ("collectionRunId") REFERENCES "BenchmarkCollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BenchmarkMetricObservation_collectionRunId_observedAt_idx" ON "BenchmarkMetricObservation"("collectionRunId", "observedAt");
CREATE UNIQUE INDEX "BenchmarkMetricObservation_snapshotId_collectionRunId_key" ON "BenchmarkMetricObservation"("snapshotId", "collectionRunId");
CREATE INDEX "BenchmarkStudy_collectionRunId_idx" ON "BenchmarkStudy"("collectionRunId");
