import { VideoAnalyticsWorkspace } from "@/components/video-analytics-workspace";
import { requireWorkspace } from "@/server/access";

export default async function HomePage() {
  await requireWorkspace();
  return <VideoAnalyticsWorkspace />;
}