import { TrendWorkspace } from "@/components/discovery/trend-workspace";
import { requireWorkspace } from "@/server/access";
import { getIntegrationDisplay } from "@/server/integrations";
import { listTrendOpportunities, publicTrendOpportunity } from "@/server/discovery/trends/read-model";
import { SUPPORTED_TREND_FILTERS } from "@/server/discovery/trends/service";

export default async function TrendsPage() {
  const { workspace, role } = await requireWorkspace();
  const [redfox, llm, trends] = await Promise.all([
    getIntegrationDisplay(workspace.id, "REDFOX"),
    getIntegrationDisplay(workspace.id, "LLM"),
    listTrendOpportunities({ workspaceId: workspace.id, window: "TODAY", platform: "ALL", type: "HOT" }),
  ]);
  return <TrendWorkspace
    initialItems={trends.map(publicTrendOpportunity)}
    configured={redfox?.status === "CONFIGURED"}
    aiConfigured={llm?.status === "CONFIGURED" || process.env.MOCK_MODE === "true"}
    mockMode={process.env.MOCK_MODE === "true"}
    canWrite={role !== "VIEWER"}
    supportedFilters={SUPPORTED_TREND_FILTERS}
  />;
}
