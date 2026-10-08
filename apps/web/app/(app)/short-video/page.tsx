import { VideoAnalyticsWorkspace } from "@/components/video-analytics-workspace";
import { requireWorkspace } from "@/server/access";
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        account?: string;
        tab?: string;
        stage?: string;
        demo?: string;
    }>;
}) { await requireWorkspace(); const q = await searchParams; return <VideoAnalyticsWorkspace initialAccount={q.account ?? ""} initialStage={q.stage ?? "all"} initialTab={q.tab ?? "overview"} initialDemo={q.demo === "1"}/>; }
