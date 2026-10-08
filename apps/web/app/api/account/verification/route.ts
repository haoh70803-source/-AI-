import { z } from "zod";
import { accountApiError, rejectCrossOrigin } from "@/server/account-api";
import { apiError } from "@/server/api-access";
import { accountDelivery } from "@/server/account-delivery";
import { requestEmailVerification, finishEmailVerification } from "@/server/account-security";
import { accountRequestLimit, accountSession } from "@/server/account-security-api";
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  try {
    const limited = await accountRequestLimit(request, "verification"); if (limited) return limited;
    const session = await accountSession(request); if (!session) return apiError("UNAUTHORIZED",401,"请先登录受邀邮箱的账号。");
    return Response.json(await requestEmailVerification(session.user.id, accountDelivery()));
  } catch (error) { return accountApiError(error); }
}
export async function PATCH(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  try {
    const limited = await accountRequestLimit(request, "verify"); if (limited) return limited;
    const session = await accountSession(request); if (!session) return apiError("UNAUTHORIZED",401,"请先登录收到验证邮件的账号，再打开链接。");
    const { token } = z.object({ token: z.string().length(64) }).strict().parse(await request.json());
    return Response.json(await finishEmailVerification(token, session.user.id));
  } catch (error) { return accountApiError(error); }
}
