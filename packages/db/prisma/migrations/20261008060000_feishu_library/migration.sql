-- CreateTable
CREATE TABLE "FeishuConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeishuConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeishuDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "documentId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT,
    "remoteRevision" TEXT,
    "checkedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeishuDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeishuChunk" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "terms" TEXT[],

    CONSTRAINT "FeishuChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeishuConnection_workspaceId_key" ON "FeishuConnection"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FeishuConnection_id_workspaceId_key" ON "FeishuConnection"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FeishuDocument_sourceItemId_key" ON "FeishuDocument"("sourceItemId");

-- CreateIndex
CREATE INDEX "FeishuDocument_workspaceId_state_idx" ON "FeishuDocument"("workspaceId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "FeishuDocument_sourceItemId_workspaceId_key" ON "FeishuDocument"("sourceItemId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FeishuDocument_connectionId_kind_token_key" ON "FeishuDocument"("connectionId", "kind", "token");

-- CreateIndex
CREATE UNIQUE INDEX "FeishuDocument_id_workspaceId_key" ON "FeishuDocument"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "FeishuChunk_workspaceId_idx" ON "FeishuChunk"("workspaceId");

-- CreateIndex
CREATE INDEX "FeishuChunk_terms_idx" ON "FeishuChunk" USING GIN ("terms");

-- CreateIndex
CREATE UNIQUE INDEX "FeishuChunk_documentId_position_key" ON "FeishuChunk"("documentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SourceItem_id_workspaceId_key" ON "SourceItem"("id", "workspaceId");

-- AddForeignKey
ALTER TABLE "FeishuConnection" ADD CONSTRAINT "FeishuConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeishuDocument" ADD CONSTRAINT "FeishuDocument_connectionId_workspaceId_fkey" FOREIGN KEY ("connectionId", "workspaceId") REFERENCES "FeishuConnection"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeishuDocument" ADD CONSTRAINT "FeishuDocument_sourceItemId_workspaceId_fkey" FOREIGN KEY ("sourceItemId", "workspaceId") REFERENCES "SourceItem"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeishuChunk" ADD CONSTRAINT "FeishuChunk_documentId_workspaceId_fkey" FOREIGN KEY ("documentId", "workspaceId") REFERENCES "FeishuDocument"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "FeishuDocument" ADD CONSTRAINT "FeishuDocument_values" CHECK ("revision">0 AND "kind" IN ('docx','wiki') AND "category" IN ('METHOD','CASE','BRAND','OTHER') AND "state" IN ('PENDING','READY','ERROR','UNAVAILABLE','REMOVED'));
ALTER TABLE "FeishuConnection" ADD CONSTRAINT "FeishuConnection_revision" CHECK ("revision">0);
