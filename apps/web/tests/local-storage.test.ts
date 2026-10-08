import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, symlink, mkdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { checkedStoragePath, inspectLocalStorage, localWorkspaceRoot, mediaFilePath, probeLocalStorage, relocateLocalStorage, withLocalStorageLock } from "../server/local-storage";
describe("local storage: real files and relocation", () => {
  let root = "";
  const beforeRoot = process.env.MEDIA_STORAGE_ROOT, beforeDriver = process.env.STORAGE_DRIVER;
  const workspaceId = `storage-${randomUUID()}`;
  beforeAll(async () => {
    const base = resolve("../../.local-data/tests"); await mkdir(base, { recursive: true });
    root = await mkdtemp(join(base, "storage-")); process.env.MEDIA_STORAGE_ROOT = root; process.env.STORAGE_DRIVER = "LOCAL_FILESYSTEM";
  });
  afterAll(async () => {
    if (beforeRoot) process.env.MEDIA_STORAGE_ROOT = beforeRoot; else delete process.env.MEDIA_STORAGE_ROOT;
    if (beforeDriver) process.env.STORAGE_DRIVER = beforeDriver; else delete process.env.STORAGE_DRIVER;
    const base = resolve("../../.local-data/tests");
    if (!relative(base, root).startsWith("..") && root !== base) await rm(root, { recursive: true, force: true });
  });
  it("writes and verifies local files without S3", async () => {
    expect((await probeLocalStorage(workspaceId)).ok).toBe(true);
    const path = await mediaFilePath(root, `${workspaceId}/source/file.txt`, workspaceId, true);
    await writeFile(path, "本机文件验收"); expect(await readFile(path, "utf8")).toBe("本机文件验收");
    expect((await inspectLocalStorage(workspaceId)).path).toContain(workspaceId);
  });
  it("copies, hashes, changes location, retains originals and restores default", async () => {
    const original = await localWorkspaceRoot(workspaceId);
    const next = await relocateLocalStorage(workspaceId, "项目资料");
    expect(next.copiedFiles).toBe(1); expect(next.path).not.toBe(original);
    expect(await readFile(join(next.path, workspaceId, "source/file.txt"), "utf8")).toBe("本机文件验收");
    expect(await readFile(join(original, workspaceId, "source/file.txt"), "utf8")).toBe("本机文件验收");
    expect((await relocateLocalStorage(workspaceId, "files")).path).toBe(original);
  });
  it("rejects traversal, drive paths, ADS, and cross-workspace configuration", async () => {
    for (const name of ["../outside", "C:\\Windows", "file:stream", "..", "CON"]) await expect(relocateLocalStorage(workspaceId, name)).rejects.toThrow();
    await expect(checkedStoragePath(root, "../../outside")).rejects.toThrow();
    await expect(checkedStoragePath(root, "file.txt:hidden")).rejects.toThrow();
    expect((await inspectLocalStorage("other-company")).path).not.toBe((await inspectLocalStorage(workspaceId)).path);
  });
  it("fails closed on conflicting files and keeps the current location", async () => {
    const destination = await checkedStoragePath(root, `workspaces/${workspaceId}/locations/conflict/${workspaceId}/source/file.txt`, true);
    await writeFile(destination, "do not overwrite");
    await expect(relocateLocalStorage(workspaceId, "conflict")).rejects.toMatchObject({ status: 409 });
    expect((await inspectLocalStorage(workspaceId)).directory).toBe("files");
    expect(await readFile(destination, "utf8")).toBe("do not overwrite");
  });
  it("serializes uploads and relocation across workers", async () => {
    await withLocalStorageLock(workspaceId, async () => { await expect(relocateLocalStorage(workspaceId, "locked")).rejects.toMatchObject({ status: 409 }); });
    expect((await probeLocalStorage(workspaceId)).ok).toBe(true);
  });
  it("moves to an explicitly selected local folder and back without deleting originals", async () => {
    const selected = join(root, "chosen-disk-folder"); await mkdir(selected);
    const original = await localWorkspaceRoot(workspaceId);
    const moved = await relocateLocalStorage(workspaceId, "files", selected);
    expect(moved.external).toBe(true); expect(moved.path).toContain(selected);
    expect(await readFile(join(moved.path, workspaceId, "source/file.txt"), "utf8")).toBe("本机文件验收");
    expect(await readFile(join(original, workspaceId, "source/file.txt"), "utf8")).toBe("本机文件验收");
    expect((await relocateLocalStorage(workspaceId, "files")).path).toBe(original);
  });
  it("rejects directory junctions instead of following them", async () => {
    const rootPath = await localWorkspaceRoot(workspaceId), elsewhere = join(root, "elsewhere"); await mkdir(elsewhere);
    await symlink(elsewhere, join(rootPath, "link"), "junction");
    await expect(checkedStoragePath(rootPath, "link/file.txt", true)).rejects.toThrow();
    await expect(relocateLocalStorage(workspaceId, "blocked-link")).rejects.toThrow();
    expect((await inspectLocalStorage(workspaceId)).directory).toBe("files");
  });
});
