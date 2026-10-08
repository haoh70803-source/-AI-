-- AlterTable
ALTER TABLE "ContentProject" ADD COLUMN     "ipContextSnapshot" JSONB;

-- CreateTable
CREATE TABLE "WorkspaceContentPolicy" (
    "workspaceId" TEXT NOT NULL,
    "hostUserId" TEXT,
    "contentOwnerUserId" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceContentPolicy_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "ContentTopic" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTopicVersion" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "judgement" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTopicVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTopicDecision" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTopicDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactConfirmation" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "contentOwnerUserId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactApproval" (
    "id" TEXT NOT NULL,
    "confirmationId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IPContextVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "positioning" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "boundaries" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IPContextVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentTopic_projectId_key" ON "ContentTopic"("projectId");

-- CreateIndex
CREATE INDEX "ContentTopic_workspaceId_updatedAt_idx" ON "ContentTopic"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTopicVersion_topicId_number_key" ON "ContentTopicVersion"("topicId", "number");

-- CreateIndex
CREATE INDEX "ContentTopicDecision_topicId_version_createdAt_idx" ON "ContentTopicDecision"("topicId", "version", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_workspaceId_createdAt_idx" ON "KnowledgeEntry"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FactRecord_workspaceId_createdAt_idx" ON "FactRecord"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FactConfirmation_factId_createdAt_idx" ON "FactConfirmation"("factId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FactApproval_confirmationId_identity_key" ON "FactApproval"("confirmationId", "identity");

-- CreateIndex
CREATE UNIQUE INDEX "IPContextVersion_workspaceId_number_key" ON "IPContextVersion"("workspaceId", "number");

-- AddForeignKey
ALTER TABLE "WorkspaceContentPolicy" ADD CONSTRAINT "WorkspaceContentPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTopic" ADD CONSTRAINT "ContentTopic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTopic" ADD CONSTRAINT "ContentTopic_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTopicVersion" ADD CONSTRAINT "ContentTopicVersion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ContentTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTopicDecision" ADD CONSTRAINT "ContentTopicDecision_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ContentTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactRecord" ADD CONSTRAINT "FactRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactRecord" ADD CONSTRAINT "FactRecord_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "KnowledgeEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactConfirmation" ADD CONSTRAINT "FactConfirmation_factId_fkey" FOREIGN KEY ("factId") REFERENCES "FactRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactApproval" ADD CONSTRAINT "FactApproval_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "FactConfirmation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IPContextVersion" ADD CONSTRAINT "IPContextVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContentTopic" ADD CONSTRAINT topic_status CHECK ("status" IN ('DRAFT','PENDING_APPROVAL','REWORK_REQUIRED','REJECTED','APPROVED','ON_HOLD','ARCHIVED'));
ALTER TABLE "ContentTopic" ADD CONSTRAINT topic_revision CHECK ("revision" > 0);
ALTER TABLE "ContentTopicDecision" ADD CONSTRAINT decision_kind CHECK ("kind" IN ('SCORE','VETO','RESOLVE','REVIEW','PROJECT','ARCHIVE'));
ALTER TABLE "ContentTopicDecision" ADD CONSTRAINT decision_version FOREIGN KEY ("topicId","version") REFERENCES "ContentTopicVersion" ("topicId","number") ON DELETE RESTRICT;
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT knowledge_confidentiality CHECK ("confidentiality" IN ('INTERNAL','RESTRICTED'));
ALTER TABLE "FactRecord" ADD CONSTRAINT fact_category CHECK ("category" IN ('STABLE','DYNAMIC','PROHIBITED','DISPUTED'));
ALTER TABLE "FactRecord" ADD CONSTRAINT fact_validity CHECK (("category" <> 'DYNAMIC' OR "validUntil" IS NOT NULL) AND ("validUntil" IS NULL OR "validUntil" > "createdAt"));
ALTER TABLE "FactConfirmation" ADD CONSTRAINT confirmation_window CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '24 hours');
ALTER TABLE "FactConfirmation" ADD CONSTRAINT distinct_approvers CHECK ("hostUserId" <> "contentOwnerUserId");
ALTER TABLE "FactApproval" ADD CONSTRAINT approval_identity CHECK ("identity" IN ('HOST','CONTENT_OWNER'));
ALTER TABLE "FactApproval" ADD CONSTRAINT approval_decision CHECK ("decision" IN ('APPROVE','REJECT'));
ALTER TABLE "IPContextVersion" ADD CONSTRAINT context_status CHECK ("status" IN ('DRAFT','PUBLISHED') AND "number" > 0);
CREATE FUNCTION content_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Content history is append-only'; END $$;
CREATE TRIGGER topic_version_immutable BEFORE UPDATE OR DELETE ON "ContentTopicVersion" FOR EACH ROW EXECUTE FUNCTION content_history_immutable();
CREATE TRIGGER topic_decision_immutable BEFORE UPDATE OR DELETE ON "ContentTopicDecision" FOR EACH ROW EXECUTE FUNCTION content_history_immutable();
CREATE TRIGGER fact_request_immutable BEFORE UPDATE OR DELETE ON "FactConfirmation" FOR EACH ROW EXECUTE FUNCTION content_history_immutable();
CREATE TRIGGER fact_approval_immutable BEFORE UPDATE OR DELETE ON "FactApproval" FOR EACH ROW EXECUTE FUNCTION content_history_immutable();
CREATE TRIGGER ip_version_immutable BEFORE UPDATE OR DELETE ON "IPContextVersion" FOR EACH ROW EXECUTE FUNCTION content_history_immutable();
CREATE FUNCTION content_record_retention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Archive content instead of deleting it'; END IF;
 IF (to_jsonb(OLD) - 'retiredAt') IS DISTINCT FROM (to_jsonb(NEW) - 'retiredAt') THEN RAISE EXCEPTION 'Create a new knowledge or fact record instead of overwriting history'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER knowledge_retention BEFORE UPDATE OR DELETE ON "KnowledgeEntry" FOR EACH ROW EXECUTE FUNCTION content_record_retention();
CREATE TRIGGER fact_retention BEFORE UPDATE OR DELETE ON "FactRecord" FOR EACH ROW EXECUTE FUNCTION content_record_retention();
CREATE TRIGGER topic_retention BEFORE DELETE ON "ContentTopic" FOR EACH ROW EXECUTE FUNCTION content_history_immutable();
CREATE FUNCTION content_audit_retention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."action" LIKE 'content.%' THEN RAISE EXCEPTION 'Content audit is append-only'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER content_audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION content_audit_retention();
