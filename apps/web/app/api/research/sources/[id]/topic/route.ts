import { z } from "zod";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { researchMember } from "@/server/research/access";
import { researchSourceDetail } from "@/server/research/read-model";
import { createIdea } from "@/server/discovery/service";
const schema = z.object({ title: z.string().trim().min(1).max(300), note: z.string().trim().max(2000).default(""), confirmWorkspaceVisibility: z.literal(true) }).strict();
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const actor = await researchApiActor(); await researchMember(actor, true);
    const { id } = await route.params, input = schema.parse(await request.json());
    await researchSourceDetail(actor, id);
    const idea = await createIdea({ workspaceId: actor.workspaceId, userId: actor.userId, title: input.title, description: input.note, sourceItemId: id, deduplicateSource: true });
    return Response.json({ id: idea.id, href: idea.projectId ? "/dashboard?project=" + idea.projectId : "/discovery/ideas/" + idea.id });
  } catch (cause) { return researchApiError(cause); }
}
