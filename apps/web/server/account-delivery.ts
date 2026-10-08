export type AccountMail = { to: string; kind: "reset" | "verify" | "invite" | "security"; url?: string; workspaceName?: string; text?: string };
export type AccountDelivery = (mail: AccountMail) => Promise<void>;
/** No outbound provider is authorized/configured. Tests inject an isolated adapter. */
export function accountDelivery(): AccountDelivery | undefined { return undefined; }
export function accountDeliveryStatus() {
  return { available: false, message: "邮件服务尚未配置。找回密码、邮箱验证和邀请暂不可用，请联系平台管理员安排受控恢复。" } as const;
}
