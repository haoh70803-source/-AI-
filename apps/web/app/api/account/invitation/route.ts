import { accountApiError, rejectCrossOrigin } from "@/server/account-api";
import { acceptInvitation } from "@/server/account-security";
import { accountRequestLimit, accountSession } from "@/server/account-security-api";
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  try {
    const limited = await accountRequestLimit(request, "accept-invitation"); if (limited) return limited;
    const session = await accountSession(request);
    return Response.json(await acceptInvitation(await request.json(), session?.user.id), { headers: { "cache-control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
