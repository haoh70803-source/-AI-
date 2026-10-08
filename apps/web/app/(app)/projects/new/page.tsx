import { Card } from "@content-center/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectForm } from "@/components/projects/project-form";
import { requireWorkspace } from "@/server/access";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ sourceItemId?: string; idea?: string }> }) {
  const { role } = await requireWorkspace();
  if (role === "VIEWER") redirect("/projects");
  const query = await searchParams;
  return <div className="mx-auto max-w-2xl"><Link href="/projects" className="mb-5 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft size={16} />返回创作</Link><header className="mb-6"><h1 className="page-heading">开始一项创作</h1><p className="page-description">先写清楚这次想讲什么，创建后会直接回到当前工作台。</p></header><Card className="p-6"><ProjectForm sourceItemId={query.sourceItemId} initialIdea={query.idea} /></Card></div>;
}
