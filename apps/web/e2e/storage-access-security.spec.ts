import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { buildSourceAssetObjectKey, createMediaRelayToken, getStorageProvider } from "@content-center/providers";
import { expect, test, type Page } from "@playwright/test";

const runId = randomUUID();
const password = "storage-access-password";
const emails = {
  a: `storage-a-${runId}@example.test`,
  b: `storage-b-${runId}@example.test`,
};
const ids: { sourceA?: string; assetA?: string; sourceB?: string; assetB?: string } = {};

async function createAccount(email: string, name: string) {
  const registration = await auth.api.signUpEmail({ body: { email, name, password } });
  const workspace = await ensurePersonalWorkspaceForUser(db, { userId: registration.user.id });
  return { userId: registration.user.id, workspaceId: workspace.id };
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeAll(async () => {
  const a = await createAccount(emails.a, "Storage A");
  const b = await createAccount(emails.b, "Storage B");
  const [sourceA, sourceB] = await Promise.all([
    db.sourceItem.create({ data: { workspaceId: a.workspaceId, createdById: a.userId, sourceType: "VIDEO", sourcePlatform: "GENERIC", title: "A private video", status: "READY" } }),
    db.sourceItem.create({ data: { workspaceId: b.workspaceId, createdById: b.userId, sourceType: "VIDEO", sourcePlatform: "GENERIC", title: "B private video", status: "READY" } }),
  ]);
  const [assetA, assetB] = await Promise.all([
    db.sourceAsset.create({ data: { workspaceId: a.workspaceId, sourceItemId: sourceA.id, assetType: "VIDEO", sourceProvider: "FIXTURE", status: "STORED", mimeType: "video/mp4", sizeBytes: 16n, storedAt: new Date() } }),
    db.sourceAsset.create({ data: { workspaceId: b.workspaceId, sourceItemId: sourceB.id, assetType: "VIDEO", sourceProvider: "FIXTURE", status: "STORED", mimeType: "video/mp4", sizeBytes: 16n, storedAt: new Date() } }),
  ]);
  const storage = getStorageProvider();
  const keyA = buildSourceAssetObjectKey({ workspaceId: a.workspaceId, sourceItemId: sourceA.id, assetId: assetA.id, assetType: "VIDEO", mimeType: "video/mp4" });
  const keyB = buildSourceAssetObjectKey({ workspaceId: b.workspaceId, sourceItemId: sourceB.id, assetId: assetB.id, assetType: "VIDEO", mimeType: "video/mp4" });
  await Promise.all([
    storage.upload({ key: keyA, body: new TextEncoder().encode("private asset A"), contentType: "video/mp4", assetScope: { workspaceId: a.workspaceId, sourceItemId: sourceA.id, assetId: assetA.id } }),
    storage.upload({ key: keyB, body: new TextEncoder().encode("private asset B"), contentType: "video/mp4", assetScope: { workspaceId: b.workspaceId, sourceItemId: sourceB.id, assetId: assetB.id } }),
    db.sourceAsset.update({ where: { id: assetA.id }, data: { storageKey: keyA } }),
    db.sourceAsset.update({ where: { id: assetB.id }, data: { storageKey: keyB } }),
  ]);
  ids.sourceA = sourceA.id;
  ids.assetA = assetA.id;
  ids.sourceB = sourceB.id;
  ids.assetB = assetB.id;
});

test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: [emails.a, emails.b] } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  const assets = await db.sourceAsset.findMany({ where: { id: { in: [ids.assetA, ids.assetB].filter((id): id is string => Boolean(id)) } }, select: { id: true, workspaceId: true, sourceItemId: true, storageKey: true } });
  const storage = getStorageProvider();
  for (const asset of assets) if (asset.storageKey) await storage.delete(asset.storageKey, { workspaceId: asset.workspaceId, sourceItemId: asset.sourceItemId, assetId: asset.id });
  if (userIds.length) await db.workspace.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

test("signs only the current user's stored asset and never accepts a raw objectKey", async ({ page }) => {
  await login(page, emails.a);
  const own = await page.request.get(`/api/source-items/${ids.sourceA}/assets/${ids.assetA}/access?disposition=attachment`);
  expect(own.status()).toBe(200);
  const ownBody = await own.json() as { url: string; expiresInSeconds: number; disposition: string; storageKey?: string };
  expect(ownBody).toMatchObject({ expiresInSeconds: 300, disposition: "attachment" });
  if (process.env.STORAGE_DRIVER === "RENDER_MEDIA_RELAY") expect(ownBody.url).toContain("/api/media/");
  else expect(ownBody.url).toContain("X-Amz-Signature");
  expect(JSON.stringify(ownBody)).not.toContain("storageKey");
  expect((await page.request.get(ownBody.url)).status()).toBe(200);
  const sourceBody = await (await page.request.get(`/api/source-items/${ids.sourceA}`)).json();
  expect(JSON.stringify(sourceBody)).not.toContain("storageKey");

  expect((await page.request.get(`/api/source-items/${ids.sourceB}/assets/${ids.assetB}/access`)).status()).toBe(404);
  expect((await page.request.get(`/api/source-items/${ids.sourceA}/assets/${ids.assetB}/access`)).status()).toBe(404);
  expect((await page.request.get(`/api/source-items/${ids.sourceA}/assets/${ids.assetA}/access?objectKey=workspaces/other/private`)).status()).toBe(400);
  expect((await page.request.get(`/api/storage/access?objectKey=${encodeURIComponent("workspaces/other/private")}`)).status()).toBe(404);
  if (process.env.STORAGE_DRIVER === "RENDER_MEDIA_RELAY") {
    const expired = createMediaRelayToken({
      scope: { workspaceId: "unknown-workspace", sourceItemId: "unknown-source", assetId: "unknown-asset" },
      expiresInSeconds: 1,
      secret: process.env.MEDIA_RELAY_SIGNING_SECRET || "test-signing-secret",
      now: Date.now() - 5_000,
    });
    expect((await page.request.get(`/api/media/${expired}`)).status()).toBe(404);
    expect((await page.request.put(`/api/internal/media-storage/${ids.assetA}`, { data: "browser cannot upload" })).status()).toBe(404);
  }
});
