import { VideoCenter } from "@/components/video-center";
import { requireWorkspace } from "@/server/access";
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        account?: string;
        tab?: string;
    }>;
}) { await requireWorkspace(); const q = await searchParams; return <VideoCenter mode="tasks" initialAccount={q.account ?? ""} initialTab={["overview", "accounts", "content", "records"].includes(q.tab ?? "") ? q.tab : "overview"}/>; }
