import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const suffix = randomUUID(); const email = `material-knowledge-${suffix}@example.test`; const password = "safe-material-knowledge-password";
let userId = ""; let workspaceId = ""; let projectId = ""; let sourceId = ""; let cookies: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }> = [];
function sessionCookies(response: Response) { return response.headers.getSetCookie().map((header) => { const [pair] = header.split(";", 1); const separator = pair!.indexOf("="); return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; }); }

test.describe.serial("Phase 10D-1 material knowledge", () => {
  test.beforeAll(async () => {
    const registration = await auth.api.signUpEmail({ body: { name: "Material Knowledge QA", email, password }, asResponse: true }); cookies = sessionCookies(registration); userId = ((await registration.clone().json()) as { user: { id: string } }).user.id; workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "资料整理验收" } })).id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", sourceProvider: "MANUAL", title: "内部访谈记录", rawText: "去年我们一共服务了12所学校。", status: "READY", projects: { create: { projectId, role: "OWN_MATERIAL" } }, transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "去年我们一共服务了12所学校。", segments: [{ startMs: 1_112_000, endMs: 1_116_000, text: "去年我们一共服务了12所学校。" }] } } } }); sourceId = source.id;
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } }); await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, version: 1, status: "COMPLETED", summary: "内部访谈包含一条待确认数字。", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt, createdById: userId } });
  });
  test.afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); if (userId) await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });
  test("extracts, traces and confirms one internal candidate", async ({ page }) => {
    const consoleIssues: string[] = []; page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); }); await page.context().addCookies(cookies); await page.goto(`/library/${sourceId}`);
    const card = page.getByTestId("material-knowledge-card"); await expect(card.getByText("整理结果")).toBeVisible(); await expect(card.getByText("去年我们一共服务了12所学校", { exact: true })).toBeVisible({ timeout: 20_000 }); await expect(card.getByText(/来源：内部访谈记录/)).toBeVisible(); await card.getByText("查看原文").click(); await expect(card.getByText("去年我们一共服务了12所学校。", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "确认" }).click(); await expect(card.getByText("已确认", { exact: true })).toBeVisible(); await expect.poll(async () => (await db.evidenceItem.findFirst({ where: { sourceItemId: sourceId } }))?.status).toBe("CONFIRMED");
    const candidate = await db.evidenceItem.findFirstOrThrow({ where: { sourceItemId: sourceId } }); expect(candidate).toMatchObject({ ownership: "OWN", status: "CONFIRMED", confirmedById: userId }); expect(consoleIssues).toEqual([]);
  });
});
