import { db } from "@content-center/db";
import { accountApiError, rejectCrossOrigin } from "@/server/account-api";
import { getSystemAdminApiContext } from "@/server/api-access";
import { accountDelivery, accountDeliveryStatus } from "@/server/account-delivery";
import { openCustomerWorkspace } from "@/server/account-security";
export async function GET() {
  const context = await getSystemAdminApiContext(); if ("response" in context) return context.response;
  const spaces = await db.workspace.findMany({ select: { id: true, name: true, disabledAt: true, createdAt: true, _count: { select: { members: { where: { disabledAt: null, user: { disabledAt: null } } } } } }, orderBy: { createdAt: "desc" } });
  return Response.json({ spaces: spaces.map(row => ({ id: row.id, name: row.name, disabled: !!row.disabledAt, activeMembers: row._count.members, isolated: row._count.members === 0 })), delivery: accountDeliveryStatus() }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getSystemAdminApiContext(); if ("response" in context) return context.response;
  try { return Response.json(await openCustomerWorkspace(context.user.id, await request.json(), accountDelivery()), { status: 201 }); }
  catch (error) { return accountApiError(error); }
}
