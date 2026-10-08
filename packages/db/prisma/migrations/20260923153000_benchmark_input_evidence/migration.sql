CREATE TABLE "BenchmarkComment" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "likes" INTEGER,
  "postedAt" TIMESTAMP(3),
  "parentId" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenchmarkComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BenchmarkComment_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BenchmarkContentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BenchmarkComment_snapshotId_externalId_key" ON "BenchmarkComment"("snapshotId", "externalId");
CREATE INDEX "BenchmarkComment_snapshotId_postedAt_idx" ON "BenchmarkComment"("snapshotId", "postedAt");
CREATE TABLE "BenchmarkMetricObservation" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metrics" JSONB NOT NULL,
  CONSTRAINT "BenchmarkMetricObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BenchmarkMetricObservation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BenchmarkContentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BenchmarkMetricObservation_snapshotId_observedAt_idx" ON "BenchmarkMetricObservation"("snapshotId", "observedAt");
