import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { IntegrationService } from "@content-center/integrations";
import { PlatformReviewWorkspace, type PlatformReviewView } from "@/components/projects/platform-review-workspace";
import { SUPPORTED_PLATFORMS } from "@/lib/platforms";
import { requireWorkspace } from "@/server/access";
import { getPlatformReview, ReviewServiceError } from "@/server/reviews/review-service";

export default async function PlatformReviewPage({ params }: { params: Promise<{ id: string; platform: string }> }) {
  const { session, workspace } = await requireWorkspace();
  const values = await params;
  const platform = z.enum(SUPPORTED_PLATFORMS).safeParse(values.platform);
  if (!platform.success) notFound();
  let review;
  try { review = await getPlatformReview({ workspaceId: workspace.id, userId: session.user.id, projectId: values.id, platform: platform.data }); }
  catch (error) { if (error instanceof ReviewServiceError && error.code === "REVIEW_TARGET_NOT_FOUND") notFound(); throw error; }
  const llm = await new IntegrationService().getIntegrationStatus(workspace.id, "LLM");
  const view: PlatformReviewView = { ...review, records: review.records.map((record) => ({ ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() })) };
  const integrationStatus = llm.status !== "CONFIGURED" && process.env.MOCK_MODE === "true" ? "MOCK" as const : llm.status;
  return <><header className="mb-5"><Link href={`/dashboard?project=${values.id}`} className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft size={16} />返回当前工作台</Link><h1 className="mt-4 text-2xl font-semibold tracking-tight">内容质量审核</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">规则检查、AI 建议与人工结论相互分离。</p></header><PlatformReviewWorkspace initial={view} integrationStatus={integrationStatus} /></>;
}
