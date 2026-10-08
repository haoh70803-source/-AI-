export const AUTH_SERVICE_MESSAGE = "登录服务暂不可用，请稍后重试。";
export const AUTH_NETWORK_MESSAGE = "网络连接失败，请检查网络后重试。";
export const AUTH_CREDENTIAL_MESSAGE = "登录未成功，请检查账号和密码。如仍无法登录，请联系管理员核查。";
export const AUTH_REAUTH_MESSAGE = "请重新登录以继续。登录状态可能已过期或失效。";
export function loginErrorMessage(error: { status?: number; code?: string } | null) {
  if (!error || error.status === 0) return AUTH_NETWORK_MESSAGE;
  if (error.status === 429) return "登录请求过于频繁，请稍后重试。";
  if ((error.status ?? 0) >= 500 || error.code === "AUTH_SERVICE_UNAVAILABLE") return AUTH_SERVICE_MESSAGE;
  return AUTH_CREDENTIAL_MESSAGE;
}
