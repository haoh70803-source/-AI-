import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { loadCreationSources } from "@/server/creation/sources";

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = z.object({ sourceItemIds: z.array(z.string().min(1).max(200)).max(8) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const sources = await loadCreationSources(context.workspace.id, [...new Set(parsed.data.sourceItemIds)], context.session.user.id);
  return Response.json({ items: sources.map(({ text: _text, image, ...source }) => ({ ...source, requiresImage: Boolean(image) })) });
}
