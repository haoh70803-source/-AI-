import { VideoCenter } from "@/components/video-center";
import { requireWorkspace } from "@/server/access";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { await requireWorkspace(); const { id } = await params; return <VideoCenter mode="task" taskId={id}/>; }
