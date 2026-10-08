import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getSystemAdminApiContext } from "@/server/api-access";
import { setUserDisabled, UserLifecycleError } from "@/server/admin/user-lifecycle";

import { rejectCrossOrigin } from "@/server/account-api";

const schema = z.object({ disabled: z.boolean() });

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getSystemAdminApiContext();
  if ("response" in context) return context.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "无效的用户状态。");
  const { id } = await route.params;
  try {
    const user = await setUserDisabled({ adminId: context.user.id, userId: id, disabled: parsed.data.disabled });
    return NextResponse.json({ user: { id: user.id, status: user.disabledAt ? "DISABLED" : "ACTIVE" } });
  } catch (error) {
    if (error instanceof UserLifecycleError) {
      const status = error.code === "USER_NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
      return apiError(error.code, status, error.message);
    }
    return apiError("USER_STATUS_UPDATE_FAILED", 500, "用户状态更新失败，请稍后重试。");
  }
}
