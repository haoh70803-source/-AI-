import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHmac, timingSafeEqual } from "node:crypto";
import { LocalStorageError, localStorageEnabled, localWorkspaceRoot, validateLocalFolder } from "./local-storage";
const exec = promisify(execFile);
let picking = false;
export function nativeDirectoryPickerAvailable() {
  try { return process.platform === "win32" && localStorageEnabled() && process.env.LOCAL_DIRECTORY_PICKER_ENABLED === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.APP_URL || "").hostname); } catch { return false; }
}
function signature(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new LocalStorageError(503, "目录选择服务尚未配置。");
  return createHmac("sha256", secret).update("local-storage-choice:v1:" + payload).digest("base64url");
}
export function signDirectorySelection(workspaceId: string, userId: string, path: string) {
  const body = Buffer.from(JSON.stringify({ workspaceId, userId, path, expiresAt: Date.now() + 5 * 60_000 })).toString("base64url");
  return body + "." + signature(body);
}
export function verifyDirectorySelection(token: string, workspaceId: string, userId: string) {
  try {
    const [body, sig, extra] = token.split(".");
    if (!body || !sig || extra) throw new Error();
    const expected = Buffer.from(signature(body)), actual = Buffer.from(sig);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const value = JSON.parse(Buffer.from(body, "base64url").toString());
    if (value.workspaceId !== workspaceId || value.userId !== userId || value.expiresAt < Date.now() || typeof value.path !== "string") throw new Error();
    return value.path as string;
  } catch { throw new LocalStorageError(400, "目录选择已过期或无效，请重新选择文件夹。"); }
}
export async function pickLocalDirectory(workspaceId: string, userId: string) {
  if (!nativeDirectoryPickerAvailable()) throw new LocalStorageError(409, "系统目录选择仅在本机 Windows 运行模式可用。");
  if (picking) throw new LocalStorageError(409, "文件夹选择窗口已经打开，请先完成或取消。");
  picking = true;
  try {
    const script = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择鑫世界资料保存目录'
$dialog.ShowNewFolderButton = $true
$dialog.SelectedPath = $env.XSJ_PICKER_START
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$owner.Show()
try { if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { @{path=$dialog.SelectedPath} | ConvertTo-Json -Compress } else { @{cancelled=$true} | ConvertTo-Json -Compress } } finally { $dialog.Dispose(); $owner.Dispose() }`;
    const result = await exec("powershell.exe", ["-NoProfile", "-STA", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 180_000, maxBuffer: 16384, encoding: "utf8", env: { ...process.env, XSJ_PICKER_START: await localWorkspaceRoot(workspaceId) } });
    const choice = JSON.parse(result.stdout.trim());
    if (choice.cancelled) return { cancelled: true as const };
    const path = await validateLocalFolder(choice.path);
    return { cancelled: false as const, selectedPath: path, selectionToken: signDirectorySelection(workspaceId, userId, path) };
  } catch (error) { if (error instanceof LocalStorageError) throw error; throw new LocalStorageError(503, "文件夹选择未完成，请检查是否已打开系统窗口，或重新选择。"); }
  finally { picking = false; }
}
