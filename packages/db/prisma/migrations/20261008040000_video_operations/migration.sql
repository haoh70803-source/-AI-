-- CreateTable
CREATE TABLE "VideoAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'DOUYIN',
    "externalId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoDailyMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "plays" INTEGER NOT NULL,
    "exposures" INTEGER,
    "likes" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "shares" INTEGER NOT NULL,
    "saves" INTEGER NOT NULL,
    "netFollowers" INTEGER NOT NULL,
    "negativeComments" INTEGER NOT NULL,
    "limited" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoContent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'IDEA',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contentId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "note" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoAccount_workspaceId_platform_externalId_key" ON "VideoAccount"("workspaceId", "platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAccount_id_workspaceId_key" ON "VideoAccount"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "VideoDailyMetric_workspaceId_day_idx" ON "VideoDailyMetric"("workspaceId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "VideoDailyMetric_accountId_day_key" ON "VideoDailyMetric"("accountId", "day");

-- CreateIndex
CREATE INDEX "VideoContent_workspaceId_stage_idx" ON "VideoContent"("workspaceId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "VideoContent_id_accountId_workspaceId_key" ON "VideoContent"("id", "accountId", "workspaceId");

-- CreateIndex
CREATE INDEX "VideoTask_workspaceId_dueAt_status_idx" ON "VideoTask"("workspaceId", "dueAt", "status");

-- CreateIndex
CREATE INDEX "VideoTask_workspaceId_assigneeId_idx" ON "VideoTask"("workspaceId", "assigneeId");

-- AddForeignKey
ALTER TABLE "VideoAccount" ADD CONSTRAINT "VideoAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoDailyMetric" ADD CONSTRAINT "VideoDailyMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoDailyMetric" ADD CONSTRAINT "VideoDailyMetric_accountId_workspaceId_fkey" FOREIGN KEY ("accountId", "workspaceId") REFERENCES "VideoAccount"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoContent" ADD CONSTRAINT "VideoContent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoContent" ADD CONSTRAINT "VideoContent_accountId_workspaceId_fkey" FOREIGN KEY ("accountId", "workspaceId") REFERENCES "VideoAccount"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTask" ADD CONSTRAINT "VideoTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTask" ADD CONSTRAINT "VideoTask_accountId_workspaceId_fkey" FOREIGN KEY ("accountId", "workspaceId") REFERENCES "VideoAccount"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTask" ADD CONSTRAINT "VideoTask_contentId_accountId_workspaceId_fkey" FOREIGN KEY ("contentId", "accountId", "workspaceId") REFERENCES "VideoContent"("id", "accountId", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "VideoDailyMetric" ADD CONSTRAINT "VideoMetric_nonnegative" CHECK ("plays">=0 AND ("exposures" IS NULL OR "exposures">=0) AND "likes">=0 AND "comments">=0 AND "shares">=0 AND "saves">=0 AND "negativeComments">=0 AND "negativeComments"<="comments" AND "revision">0);
ALTER TABLE "VideoAccount" ADD CONSTRAINT "VideoAccount_revision" CHECK ("revision">0);
ALTER TABLE "VideoContent" ADD CONSTRAINT "VideoContent_stage" CHECK ("stage" IN ('IDEA','EDITING','REVIEW','READY','PUBLISHED','ARCHIVED') AND "revision">0);
ALTER TABLE "VideoTask" ADD CONSTRAINT "VideoTask_status" CHECK ("status" IN ('TODO','IN_PROGRESS','DONE') AND "kind" IN ('PUBLISH','LIVE','COMMENT','EDIT','ADS') AND "revision">0 AND (("status"='DONE')=("completedAt" IS NOT NULL)));
