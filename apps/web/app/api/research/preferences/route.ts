import { researchApiActor, researchApiError } from "@/server/research/api";
import { researchObjectAction } from "@/server/research/preferences";
export async function POST(request: Request) {
  try {
    const actor = await researchApiActor();
    const value = await request.json();
    if (value?.kind === "NEWS" || value?.kind === "NEWS_LATER" || ["BENCHMARK_TEACHER", "BENCHMARK_REFERENCE", "WORK_DISMISSED", "REPORT_ARCHIVED"].includes(value?.kind)) {
      if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: { code: "ORIGIN_DENIED", message: "请从当前工作台操作。" } }, { status: 403 });
    }
    return Response.json(await researchObjectAction(actor, value));
  }
  catch (error) { return researchApiError(error); }
}
