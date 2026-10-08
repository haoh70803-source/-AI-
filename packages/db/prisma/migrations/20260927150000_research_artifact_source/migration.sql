ALTER TABLE "Artifact" ADD COLUMN "sourceResearchRunId" TEXT;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_sourceResearchRunId_fkey" FOREIGN KEY ("sourceResearchRunId") REFERENCES "ResearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Artifact_projectId_sourceResearchRunId_key" ON "Artifact"("projectId", "sourceResearchRunId");
