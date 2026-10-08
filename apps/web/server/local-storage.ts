import { createHash, randomUUID } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, statfs, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, parse, toNamespacedPath } from "node:path";
import { resolveStoragePath } from "@content-center/providers";
import { db } from "@content-center/db";

export class LocalStorageError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function localStorageEnabled() { return process.env.STORAGE_DRIVER === "LOCAL_FILESYSTEM"; }
export function localStorageBase() {
  if (!localStorageEnabled() || !process.env.MEDIA_STORAGE_ROOT) throw new LocalStorageError(409, "当前环境未启用本机文件存储。");
  return resolve(process.env.MEDIA_STORAGE_ROOT);
}
function identifier(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new LocalStorageError(400, "空间标识无效。");
  return value;
}
function folderName(value: string) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_ -]{0,59}$/u.test(value) || value !== value.trim() || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) throw new LocalStorageError(400, "目录名称请使用 1–60 个文字、数字、空格、横线或下划线。");
  return value;
}
/** Validate every existing component, including junctions, before filesystem access. */
export async function checkedStoragePath(root: string, key: string, createParents = false) {
  if (key.split(/[\\/]/).some(part => part.includes(":") || [...part].some(char => char.charCodeAt(0) < 32) || /[. ]$/.test(part))) throw new LocalStorageError(400, "文件路径无效。");
  const target = resolveStoragePath(root, key);
  if (resolve(root) !== parse(resolve(root)).root) await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink()) throw new LocalStorageError(400, "存储目录不能是链接或目录映射。");
  const parts = relative(root, target).split(/[\\/]/);
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!);
    let entry;
    try { entry = await lstat(current); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (createParents && index < parts.length - 1) { await mkdir(current); entry = await lstat(current); }
    }
    if (entry?.isSymbolicLink()) throw new LocalStorageError(400, "存储路径包含链接或目录映射，无法使用。");
  }
  return target;
}
async function home(workspaceId: string) {
  return checkedStoragePath(localStorageBase(), `workspaces/${identifier(workspaceId)}/settings.json`, true).then(dirname);
}
async function readSettings(workspaceId: string): Promise<{ directory: string; externalRoot?: string }> {
  const path = join(await home(workspaceId), "settings.json");
  try { const data = JSON.parse(await readFile(path, "utf8")); return { directory: folderName(data.directory), ...(typeof data.externalRoot === "string" && isAbsolute(data.externalRoot) ? { externalRoot: data.externalRoot } : {}) }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { directory: "files" }; throw new LocalStorageError(409, "本地存储设置无法读取，请联系管理员检查配置文件。"); }
}
export async function localWorkspaceRoot(workspaceId: string) {
  const settings = await readSettings(workspaceId);
  if (settings.externalRoot) {
    const root = await validateLocalFolder(settings.externalRoot);
    const marker = JSON.parse(await readFile(join(root, ".xsj-workspace.json"), "utf8"));
    if (marker.workspaceId !== workspaceId) throw new LocalStorageError(409, "存储目录不属于当前公司空间。");
    return root;
  }
  const root = dirname(await checkedStoragePath(await home(workspaceId), `locations/${settings.directory}/.probe`, true));
  return root;
}
export async function mediaFilePath(root: string, key: string, workspaceId: string, createParents = false) {
  if (!localStorageEnabled()) return resolveStoragePath(root, key);
  return checkedStoragePath(await localWorkspaceRoot(workspaceId), key, createParents);
}
/** Shared by uploads/deletes/relocation. The DB releases the lock even if a worker crashes. */
export async function withLocalStorageLock<T>(workspaceId: string, work: (assertHeld: () => Promise<void>) => Promise<T>): Promise<T> {
  if (!localStorageEnabled()) return work(async () => undefined);
  identifier(workspaceId);
  const lockStartedAt = Date.now();
  return db.$transaction(async tx => {
    const result = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('content-center-local-storage'), hashtext(${workspaceId})) AS locked`;
    if (!result[0]?.locked) throw new LocalStorageError(409, "文件正在写入或位置正在切换，请稍后重试。");
    return work(async () => {
      if (Date.now() - lockStartedAt > 285_000) throw new LocalStorageError(409, "迁移耗时过长，原位置未改变，请稍后重试。");
      await tx.$queryRaw`SELECT 1`;
    });
  }, { timeout: 300_000 });
}
async function digest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(toNamespacedPath(path))) hash.update(chunk);
  return hash.digest("hex");
}
async function files(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(prefix ? await checkedStoragePath(root, prefix) : root, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new LocalStorageError(409, "目录包含链接，已停止切换，原位置未改变。");
    if (entry.isDirectory()) output.push(...await files(root, key));
    else if (entry.isFile()) output.push(key);
  }
  return output;
}
export async function inspectLocalStorage(workspaceId: string) {
  const settings = await readSettings(workspaceId), root = await localWorkspaceRoot(workspaceId);
  const locations = join(await home(workspaceId), "locations");
  await mkdir(locations, { recursive: true });
  const entries = await readdir(locations, { withFileTypes: true });
  const disk = await statfs(root);
  return { directory: settings.directory, external: Boolean(settings.externalRoot), path: root, defaultDirectory: "files", allowedPath: locations, directories: entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).map(entry => entry.name), availableBytes: Number(disk.bavail) * Number(disk.bsize) };
}
export async function probeLocalStorage(workspaceId: string) {
  return withLocalStorageLock(workspaceId, async () => {
    const root = await localWorkspaceRoot(workspaceId);
    const file = await checkedStoragePath(root, `.read-write-${randomUUID()}`);
    const content = randomUUID();
    try { await writeFile(file, content, { flag: "wx" }); if (await readFile(file, "utf8") !== content) throw new Error("READ_MISMATCH"); }
    finally { await rm(file, { force: true }); }
    return { ok: true, message: "读写正常，已完成本机文件写入和读取验证。" };
  });
}
export async function relocateLocalStorage(workspaceId: string, directory: string, selectedPath?: string) {
  folderName(directory);
  return withLocalStorageLock(workspaceId, async assertHeld => {
    const current = await readSettings(workspaceId);
    if (!selectedPath && !current.externalRoot && current.directory === directory) return { ...(await inspectLocalStorage(workspaceId)), copiedFiles: 0 };
    const source = await localWorkspaceRoot(workspaceId);
    let target = dirname(await checkedStoragePath(await home(workspaceId), `locations/${directory}/.probe`, true));
    if (selectedPath) {
      const selected = await validateLocalFolder(selectedPath);
      if (selected === source) return { ...(await inspectLocalStorage(workspaceId)), copiedFiles: 0 };
      target = dirname(await checkedStoragePath(selected, `鑫世界资料/${identifier(workspaceId)}/.probe`, true));
      const markerPath = join(target, ".xsj-workspace.json");
      try { const marker = JSON.parse(await readFile(markerPath, "utf8")); if (marker.workspaceId !== workspaceId) throw new LocalStorageError(409, "目标目录属于其他公司空间。"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await writeFile(markerPath, JSON.stringify({ workspaceId }), { flag: "wx" }); }
    }
    if (target === source) return { ...(await inspectLocalStorage(workspaceId)), copiedFiles: 0 };
    if (isWithin(source, target) || isWithin(target, source)) throw new LocalStorageError(409, "请选择当前存储位置之外的目录，不能互相嵌套。");
    const keys = (await files(source)).filter(key => key !== ".xsj-workspace.json");
    for (const key of keys) {
      const from = await checkedStoragePath(source, key), to = await checkedStoragePath(target, key, true);
      const expected = await digest(from);
      let exists = false;
      try { await lstat(to); exists = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (exists) { if (await digest(to) !== expected) throw new LocalStorageError(409, "目标目录有同名但内容不同的文件，原位置未改变。请选择新的目录。"); continue; }
      const temporary = `${to}.copy-${randomUUID()}`;
      try { await copyFile(toNamespacedPath(from), toNamespacedPath(temporary), constants.COPYFILE_EXCL); if (await digest(temporary) !== expected) throw new LocalStorageError(500, "复制校验失败，原位置未改变。"); await rename(toNamespacedPath(temporary), toNamespacedPath(to)); }
      finally { await rm(toNamespacedPath(temporary), { force: true }); }
    }
    await assertHeld();
    const settingsPath = await checkedStoragePath(await home(workspaceId), "settings.json");
    const temp = `${settingsPath}.${randomUUID()}.tmp`;
    try { await writeFile(temp, JSON.stringify({ directory, ...(selectedPath ? { externalRoot: target } : {}) }), { flag: "wx" }); await assertHeld(); await rename(temp, settingsPath); }
    finally { await rm(temp, { force: true }); }
    return { ...(await inspectLocalStorage(workspaceId)), copiedFiles: keys.length };
  });
}

function isWithin(parent: string, child: string) { const part = relative(parent, child); return !!part && !part.startsWith("..") && !isAbsolute(part); }
export async function validateLocalFolder(value: string) {
  if (!isAbsolute(value) || value.startsWith("\\\\") || value.includes(String.fromCharCode(0))) throw new LocalStorageError(400, "请选择本机磁盘上的有效文件夹。");
  const selected = resolve(value), drive = parse(selected).root;
  await checkedStoragePath(drive, relative(drive, selected) ? relative(drive, selected) + "/.xsj-check" : ".xsj-check");
  if (!(await lstat(selected)).isDirectory()) throw new LocalStorageError(400, "所选位置不是文件夹。");
  return selected;
}
