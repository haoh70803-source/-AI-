import { requireWorkspace } from "@/server/access";
import { FeishuLibrary } from "@/components/library/feishu-library";
export default async function FeishuPage() { await requireWorkspace(); return <FeishuLibrary />; }
