import { nativeDirectoryPickerAvailable, pickLocalDirectory, verifyDirectorySelection } from "@/server/local-directory-picker";
import { db } from "@content-center/db";
import { z } from "zod";
import { getApiWorkspaceContext, apiError } from "@/server/api-access";
import { rejectCrossOrigin } from "@/server/account-api";
import { inspectLocalStorage, localStorageEnabled, LocalStorageError, probeLocalStorage, relocateLocalStorage } from "@/server/local-storage";
export const runtime = "nodejs";
export const maxDuration = 300;
async function context() {
  const actor = await getApiWorkspaceContext();
  if (!actor) return { response: apiError("UNAUTHORIZED", 401, "请重新登录。") };
  if (!["OWNER", "ADMIN"].includes(actor.role)) return { response: apiError("FORBIDDEN", 403, "只有公司所有者或管理员可以管理本机存储。") };
  return { actor };
}
function failure(error: unknown) {
  if (error instanceof LocalStorageError) return apiError("LOCAL_STORAGE_FAILED", error.status, error.message);
  return apiError("LOCAL_STORAGE_FAILED", 500, "本机目录无法读写，请检查磁盘空间和文件权限。原保存位置未改变。");
}
export async function GET() {
  const result = await context(); if (result.response) return result.response;
  if (!localStorageEnabled()) return Response.json({ enabled: false });
  try {
    const [storage, assets] = await Promise.all([inspectLocalStorage(result.actor!.workspace.id), db.sourceAsset.aggregate({ where: { workspaceId: result.actor!.workspace.id, status: "STORED" }, _count: true, _sum: { sizeBytes: true } })]);
    return Response.json({ enabled: true, nativePicker: nativeDirectoryPickerAvailable(), ...storage, assetCount: assets._count, assetBytes: Number(assets._sum.sizeBytes ?? 0) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const result = await context(); if (result.response) return result.response;
  const parsed = z.discriminatedUnion("action", [z.object({ action: z.literal("pick") }).strict(), z.object({ action: z.literal("relocateSelected"), selectionToken: z.string().min(1).max(8000) }).strict(), z.object({ action: z.literal("probe") }).strict(), z.object({ action: z.literal("relocate"), directory: z.string().min(1).max(60) }).strict(), z.object({ action: z.literal("reset") }).strict()]).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请选择有效的目录或操作。");
  try {
    const workspaceId = result.actor!.workspace.id;
    if (parsed.data.action === "pick" || parsed.data.action === "relocateSelected") {
      if (!nativeDirectoryPickerAvailable() || request.headers.get("origin") !== new URL(process.env.APP_URL!).origin) return apiError("FORBIDDEN", 403, "请在本机应用内选择目录。");
      if (parsed.data.action === "pick") return Response.json(await pickLocalDirectory(workspaceId, result.actor!.session.user.id));
      const selected = verifyDirectorySelection(parsed.data.selectionToken, workspaceId, result.actor!.session.user.id);
      const storage = await relocateLocalStorage(workspaceId, "files", selected);
      return Response.json({ ...storage, ok: true, message: `已校验 ${storage.copiedFiles} 个文件并切换保存位置，旧目录保留。` });
    }
    if (parsed.data.action === "probe") return Response.json(await probeLocalStorage(workspaceId));
    const storage = await relocateLocalStorage(workspaceId, parsed.data.action === "reset" ? "files" : parsed.data.directory);
    return Response.json({ ...storage, ok: true, message: `保存位置已更改，已校验 ${storage.copiedFiles} 个文件。旧目录保留，后续文件写入新位置。` });
  } catch (error) { return failure(error); }
}
