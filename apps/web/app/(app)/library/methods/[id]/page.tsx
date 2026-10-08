import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MethodDetail } from "@/components/library/method-detail";
import { requireWorkspace } from "@/server/access";
import { getMethod } from "@/server/methods/service";

export default async function MethodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { session, workspace, role } = await requireWorkspace();
  const { id } = await params;
  const method = await getMethod({ workspaceId: workspace.id, ownerUserId: session.user.id, methodId: id });
  if (!method) notFound();
  return <div className="v3-page v3-method-detail-page"><Link href="/library/methods" className="v3-method-back"><ArrowLeft size={16} />返回 Skill</Link><MethodDetail initial={method} editable={role !== "VIEWER"} /></div>;
}
