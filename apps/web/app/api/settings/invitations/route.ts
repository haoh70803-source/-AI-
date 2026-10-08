import { z } from "zod";
import { accountApiError, rejectCrossOrigin } from "@/server/account-api";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { accountDelivery, accountDeliveryStatus } from "@/server/account-delivery";
import { issueInvitation, listInvitations, revokeInvitation } from "@/server/account-security";
export async function GET() {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED",401);
  try { return Response.json({ invitations: await listInvitations(context.workspace.id, context.session.user.id), delivery: accountDeliveryStatus() }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return accountApiError(error); }
}
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED",401);
  try { return Response.json(await issueInvitation(context.workspace.id, context.session.user.id, await request.json(), accountDelivery()), { status: 201 }); }
  catch (error) { return accountApiError(error); }
}
export async function DELETE(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED",401);
  try { const { id } = z.object({ id: z.string().max(200) }).strict().parse(await request.json()); return Response.json(await revokeInvitation(context.workspace.id, context.session.user.id, id)); }
  catch (error) { return accountApiError(error); }
}
