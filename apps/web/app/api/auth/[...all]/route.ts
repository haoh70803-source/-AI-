import { isExperienceAccount } from "../../../../server/experience-account";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { db } from "@content-center/db";
import { rejectCrossOrigin } from "../../../../server/account-api";
import { AUTH_CREDENTIAL_MESSAGE } from "../../../../lib/auth-errors";
import { accountRequestLimit } from "../../../../server/account-security-api";
import { auth } from "../../../../lib/auth";
import { loginResponse } from "../../../../server/auth-response";
import { isDirectSignupRequest } from "../../../../server/internal-signup";

const handlers = toNextJsHandler(auth);
const mailActions = ["/request-password-reset", "/reset-password", "/send-verification-email", "/verify-email", "/change-email"];
const controlledMailResponse = () => NextResponse.json({ code: "ACCOUNT_ACTION_USE_CONTROLLED_FLOW", message: "请通过账号安全页面操作；邮件服务未配置时请联系平台管理员。" }, { status: 403 });
async function rejectedInactiveSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session && !await db.user.findFirst({ where: { id: session.user.id, disabledAt: null }, select: { id: true } })) {
    if (new URL(request.url).pathname.replace(/\/$/, "").endsWith("/get-session"))
      return NextResponse.json(null, { headers: { "cache-control": "no-store" } });
    return NextResponse.json({ code: "UNAUTHORIZED", message: "请重新登录以继续。" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  return null;
}
export const GET = (request: Request) => loginResponse(async () => {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (mailActions.some(endpoint => path.endsWith(endpoint)) || /\/reset-password\//.test(path)) return controlledMailResponse();
  if (path.endsWith("/sign-in/email") || path.endsWith("/sign-up/email")) return NextResponse.json({code:"METHOD_NOT_ALLOWED"}, {status:405});
  const rejected = await rejectedInactiveSession(request); if (rejected) return rejected;
  return handlers.GET(request);
});
export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (mailActions.some(endpoint => path.endsWith(endpoint))) return controlledMailResponse();
  if (isDirectSignupRequest(request)) return NextResponse.json({ code: "DIRECT_SIGNUP_DISABLED", message: "请通过公司邀请注册入口创建账号。" }, { status: 403 });
  return loginResponse(async () => {
    if (path.endsWith("/sign-in/email")) { const rejected = rejectCrossOrigin(request); if (rejected) return rejected; const limited = await accountRequestLimit(request, "login"); if (limited) return limited; }
    if (!path.endsWith("/sign-in/email") && !path.endsWith("/sign-out")) {
      const rejected = await rejectedInactiveSession(request); if (rejected) return rejected;
      const session = await auth.api.getSession({ headers: request.headers });
      if (session && isExperienceAccount(session.user)) return NextResponse.json({ message: "体验账号不能更改账号设置。" }, { status: 403 });
    }
    const response = await handlers.POST(request);
    if (path.endsWith("/sign-in/email") && [400,401,403].includes(response.status)) return NextResponse.json({ code: "INVALID_CREDENTIALS", message: AUTH_CREDENTIAL_MESSAGE }, { status: 401, headers: { "cache-control": "no-store" } });
    return response;
  });
}
