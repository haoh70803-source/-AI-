import { researchApiActor, researchApiError } from "@/server/research/api";
import { getWorkResearchForExport } from "@/server/research/work-research-service";
import { workResearchMarkdown, workResearchMarkdownFilename } from "@/components/research/work-research-markdown";

export async function GET(request: Request, route: { params: Promise<{ id: string; workId: string; runId: string }> }) {
  try {
    const actor = await researchApiActor(); const { id, workId, runId } = await route.params;
    const report = await getWorkResearchForExport(actor, id, workId, runId);
    const content = workResearchMarkdown({ ...report, origin: new URL(request.url).origin });
    const filename = workResearchMarkdownFilename(report.evidence.title, report.version);
    return new Response(content, { headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="work-research.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    } });
  } catch (error) { return researchApiError(error); }
}
