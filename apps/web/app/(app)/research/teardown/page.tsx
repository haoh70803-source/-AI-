import { requireWorkspace } from "@/server/access";
import { getTeardown, listTeardowns } from "@/server/research/teardown/service";
import { researchProjectOptions } from "@/server/research/read-model";
import { TeardownWorkspace } from "@/components/research/teardown/teardown-workspace";
import "@/components/research/teardown/teardown.css";
import { notFound } from "next/navigation";
import { ResearchError } from "@/server/research/access";

export default async function TeardownPage({ searchParams }: { searchParams: Promise<{ run?: string; page?: string }> }) {
  const { workspace, session, role } = await requireWorkspace();
  const actor = { workspaceId: workspace.id, userId: session.user.id };
  const query = await searchParams;
  const runId = query.run;
  const page = /^\d+$/.test(query.page ?? "") && Number(query.page) >= 1 && Number(query.page) <= 1000000 ? Number(query.page) : 1;
  const [history, projects, selected] = await Promise.all([listTeardowns(actor, page), researchProjectOptions(actor), runId ? getTeardown(actor, runId).catch(error => { if (error instanceof ResearchError && error.status === 404) notFound(); throw error; }) : Promise.resolve(null)]);
  return <TeardownWorkspace history={history} selected={selected} projects={projects} canWrite={role !== "VIEWER"} />;
}
