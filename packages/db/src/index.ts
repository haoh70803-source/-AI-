import { PrismaClient } from "@prisma/client";
import { reviewDatabaseTarget } from "./review-target";
import { assertTestDatabaseTarget } from "./test-target";
export type { Prisma, PromptType, AIRunStatus, Platform, PlatformVariantStatus, DeepContentPackageStatus, MotherContentOrigin, DraftRevisionOrigin, ReviewResult, PublishStatus, RecommendationMode, RecommendationItemStatus, RecommendationEvidenceType, MaterialAnalysis, MaterialDistillation, SystemRole, CanvasObjectType, EvidenceType, EvidenceOwnership, EvidenceStatus, CreatorProfileSuggestionType, MethodSuggestionType } from "@prisma/client";

const validatedReviewTarget = reviewDatabaseTarget(process.env);
const testTarget = (process.env.VITEST || process.env.NODE_ENV === "test" || process.env.ENVIRONMENT_ID === "LOCAL_TEST") ? assertTestDatabaseTarget(process.env) : undefined;
const reviewTarget = validatedReviewTarget ?? testTarget;
const globalForPrisma = globalThis as unknown as { contentCenterDb?: PrismaClient; contentCenterDbTarget?: string };
if (reviewTarget && globalForPrisma.contentCenterDb && globalForPrisma.contentCenterDbTarget !== reviewTarget) {
  throw new Error("REVIEW_CACHED_DATABASE_MISMATCH");
}

export const db = globalForPrisma.contentCenterDb ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.contentCenterDb = db;
  globalForPrisma.contentCenterDbTarget = process.env.DATABASE_URL;
}

export * from "./workspaces";
export * from "./sources";
export * from "./projects";

export { assertTestDatabaseTarget } from "./test-target";
