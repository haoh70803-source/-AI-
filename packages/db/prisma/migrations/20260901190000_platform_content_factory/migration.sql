-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('DOUYIN', 'XIAOHONGSHU', 'WECHAT_MOMENTS', 'WECHAT_CHANNELS', 'WECHAT_OFFICIAL');
CREATE TYPE "PlatformVariantStatus" AS ENUM ('DRAFT', 'READY', 'STALE', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- ExtendEnum
ALTER TYPE "PromptType" ADD VALUE 'ADAPT_PLATFORM';

-- AlterTable
ALTER TABLE "AIRun" ALTER COLUMN "promptTemplateId" DROP NOT NULL;
ALTER TABLE "AIRun" ADD COLUMN "platformTemplateId" TEXT;
ALTER TABLE "AIRun" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "PlatformTemplate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "platform" "Platform" NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "systemPrompt" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformVariant" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "motherContentId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "hook" TEXT,
  "summary" TEXT,
  "hashtags" JSONB NOT NULL,
  "mediaPlan" JSONB NOT NULL,
  "metadata" JSONB NOT NULL,
  "status" "PlatformVariantStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceMotherVersion" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTemplate_workspaceId_platform_version_key" ON "PlatformTemplate"("workspaceId", "platform", "version");
CREATE INDEX "PlatformTemplate_platform_isActive_version_idx" ON "PlatformTemplate"("platform", "isActive", "version");
CREATE INDEX "PlatformTemplate_workspaceId_platform_isActive_idx" ON "PlatformTemplate"("workspaceId", "platform", "isActive");
CREATE UNIQUE INDEX "PlatformVariant_projectId_platform_key" ON "PlatformVariant"("projectId", "platform");
CREATE INDEX "PlatformVariant_workspaceId_projectId_idx" ON "PlatformVariant"("workspaceId", "projectId");
CREATE INDEX "PlatformVariant_workspaceId_platform_updatedAt_idx" ON "PlatformVariant"("workspaceId", "platform", "updatedAt");
CREATE INDEX "PlatformVariant_motherContentId_idx" ON "PlatformVariant"("motherContentId");
CREATE INDEX "PlatformVariant_createdById_idx" ON "PlatformVariant"("createdById");
CREATE INDEX "AIRun_platformTemplateId_idx" ON "AIRun"("platformTemplateId");

-- AddForeignKey
ALTER TABLE "PlatformTemplate" ADD CONSTRAINT "PlatformTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformVariant" ADD CONSTRAINT "PlatformVariant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformVariant" ADD CONSTRAINT "PlatformVariant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformVariant" ADD CONSTRAINT "PlatformVariant_motherContentId_fkey" FOREIGN KEY ("motherContentId") REFERENCES "MotherContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformVariant" ADD CONSTRAINT "PlatformVariant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_platformTemplateId_fkey" FOREIGN KEY ("platformTemplateId") REFERENCES "PlatformTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed five distinct system templates. MotherContent is authoritative; no new facts may be invented.
INSERT INTO "PlatformTemplate" ("id", "workspaceId", "platform", "name", "version", "systemPrompt", "template", "isActive", "createdAt", "updatedAt") VALUES
('system-platform-douyin-v1', NULL, 'DOUYIN', 'System Douyin v1', 1, 'You adapt approved mother content for Douyin. MotherContent is authoritative. Never add facts, data, people, cases, or quotations that are not present. Never change the core viewpoint. Reorganize for short spoken delivery, enter the topic quickly, use natural short sentences, keep logic clear, and end with non-formulaic interaction. Return only valid JSON.', 'Action: ADAPT_PLATFORM\nTarget: DOUYIN\nCreate a spoken script for the requested duration. Do not create video files. Include practical shot suggestions only.\nContext:\n{{context}}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('system-platform-xiaohongshu-v1', NULL, 'XIAOHONGSHU', 'System Xiaohongshu v1', 1, 'You adapt approved mother content for Xiaohongshu. MotherContent is authoritative. Never invent facts, data, people, cases, or quotations, and never alter the core viewpoint. Rebuild reading rhythm and structure for the selected style. Use natural paragraphs and limited emoji; avoid outline-like AI prose. Return only valid JSON.', 'Action: ADAPT_PLATFORM\nTarget: XIAOHONGSHU\nCreate three distinct title candidates, natural body copy, hashtags, cover title candidates, and image ideas.\nContext:\n{{context}}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('system-platform-wechat-moments-v1', NULL, 'WECHAT_MOMENTS', 'System WeChat Moments v1', 1, 'You adapt approved mother content for WeChat Moments. MotherContent is authoritative. Do not add facts or change its viewpoint. Write like the creator speaks, with weak headline and marketing signals. Do not turn it into an official-account article. Return only valid JSON.', 'Action: ADAPT_PLATFORM\nTarget: WECHAT_MOMENTS\nCreate SHORT, VIEWPOINT, and STORY versions. Keep all three materially different in presentation while preserving the same facts.\nContext:\n{{context}}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('system-platform-wechat-channels-v1', NULL, 'WECHAT_CHANNELS', 'System WeChat Channels v1', 1, 'You adapt approved mother content for WeChat Channels. MotherContent is authoritative. Never invent facts, data, people, cases, or quotations, and never change the core viewpoint. Create natural spoken content with clear pacing. This platform has its own expression rules and must not copy the Douyin template. Return only valid JSON.', 'Action: ADAPT_PLATFORM\nTarget: WECHAT_CHANNELS\nCreate title, hook, spoken body, description, and hashtags for WeChat Channels.\nContext:\n{{context}}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('system-platform-wechat-official-v1', NULL, 'WECHAT_OFFICIAL', 'System WeChat Official v1', 1, 'You adapt approved mother content for a WeChat Official Account. MotherContent is authoritative. Never invent facts, data, people, cases, or quotations, and never change the core viewpoint. Longer structure is allowed, but avoid mechanical First/Second/Third and In conclusion phrasing. Return only valid JSON.', 'Action: ADAPT_PLATFORM\nTarget: WECHAT_OFFICIAL\nCreate a title, summary, structured long-form body, and outline with a lead, clear hierarchy, and natural ending.\nContext:\n{{context}}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
