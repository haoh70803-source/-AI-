import { db } from "@content-center/db";
import { notFound } from "next/navigation";
import { TrendDetailWorkspace } from "@/components/discovery/trend-detail-workspace";
import { requireWorkspace } from "@/server/access";
import { getIntegrationDisplay } from "@/server/integrations";
import { decodeTrendOpportunityKey, getTrendOpportunity, publicTrendOpportunity } from "@/server/discovery/trends/read-model";

export default async function TrendDetailPage({ params }: PageProps<"/discovery/trends/[key]">) {
  const { workspace, role } = await requireWorkspace();
  const { key: encodedKey } = await params;
  const key = decodeTrendOpportunityKey(encodedKey);
  const opportunity = await getTrendOpportunity(workspace.id, key);
  if (!opportunity) notFound();
  const [llm, ideas] = await Promise.all([
    getIntegrationDisplay(workspace.id, "LLM"),
    db.contentIdea.findMany({
      where: { workspaceId: workspace.id, status: { not: "ARCHIVED" }, references: { some: { trendSnapshotId: { in: opportunity.supportingSnapshotIds } } } },
      orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, title: true, status: true },
    }),
  ]);
  return <TrendDetailWorkspace
    initialOpportunity={publicTrendOpportunity(opportunity)}
    initialIdeas={ideas}
    canWrite={role !== "VIEWER"}
    aiConfigured={llm?.status === "CONFIGURED" || process.env.MOCK_MODE === "true"}
    mockMode={process.env.MOCK_MODE === "true"}
  />;
}
