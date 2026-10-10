-- Additive only. Execute after explicit operator approval and backup.
CREATE TABLE "FeishuSubscription" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "connectionId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "scope" TEXT NOT NULL, "rootToken" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL, "originalUrl" TEXT NOT NULL, "name" TEXT NOT NULL,
  "category" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'ACTIVE', "revision" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'PENDING', "syncRequestedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "lastAttemptAt" TIMESTAMP(3), "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeishuSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeishuSubscription_scope_check" CHECK ("scope" IN ('SPACE', 'SUBTREE')),
  CONSTRAINT "FeishuSubscription_state_check" CHECK ("state" IN ('ACTIVE', 'PAUSED'))
);
CREATE UNIQUE INDEX "FeishuSubscription_id_workspaceId_key" ON "FeishuSubscription"("id", "workspaceId");
CREATE UNIQUE INDEX "FeishuSubscription_connectionId_scope_rootToken_key" ON "FeishuSubscription"("connectionId", "scope", "rootToken");
CREATE INDEX "FeishuSubscription_workspaceId_state_idx" ON "FeishuSubscription"("workspaceId", "state");
ALTER TABLE "FeishuSubscription" ADD CONSTRAINT "FeishuSubscription_connectionId_workspaceId_fkey"
  FOREIGN KEY ("connectionId", "workspaceId") REFERENCES "FeishuConnection"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "FeishuSubscriptionNode" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "subscriptionId" TEXT NOT NULL,
  "nodeToken" TEXT NOT NULL, "parentNodeToken" TEXT NOT NULL, "objToken" TEXT NOT NULL,
  "objType" TEXT NOT NULL, "title" TEXT NOT NULL, "originalUrl" TEXT NOT NULL, "documentId" TEXT,
  "available" BOOLEAN NOT NULL DEFAULT true, "state" TEXT NOT NULL DEFAULT 'DISCOVERED',
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeishuSubscriptionNode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeishuSubscriptionNode_subscriptionId_nodeToken_key" ON "FeishuSubscriptionNode"("subscriptionId", "nodeToken");
CREATE INDEX "FeishuSubscriptionNode_workspaceId_documentId_available_idx" ON "FeishuSubscriptionNode"("workspaceId", "documentId", "available");
ALTER TABLE "FeishuSubscriptionNode" ADD CONSTRAINT "FeishuSubscriptionNode_subscriptionId_workspaceId_fkey"
  FOREIGN KEY ("subscriptionId", "workspaceId") REFERENCES "FeishuSubscription"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeishuSubscriptionNode" ADD CONSTRAINT "FeishuSubscriptionNode_documentId_workspaceId_fkey"
  FOREIGN KEY ("documentId", "workspaceId") REFERENCES "FeishuDocument"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
