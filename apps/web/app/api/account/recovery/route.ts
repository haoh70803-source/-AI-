import { accountApiError, rejectCrossOrigin } from "@/server/account-api";
import { accountDelivery } from "@/server/account-delivery";
import { requestPasswordRecovery, finishPasswordRecovery } from "@/server/account-security";
import { accountRequestLimit } from "@/server/account-security-api";
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  try {
    const limited = await accountRequestLimit(request, "recovery"); if (limited) return limited;
    const data = await request.json();
    return Response.json(await requestPasswordRecovery(data.email, accountDelivery()), { headers: { "cache-control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
export async function PATCH(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  try {
    const limited = await accountRequestLimit(request, "reset"); if (limited) return limited;
    return Response.json(await finishPasswordRecovery(await request.json(), accountDelivery()), { headers: { "cache-control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
