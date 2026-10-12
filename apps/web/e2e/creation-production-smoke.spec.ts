import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { db } from "@content-center/db";
import { auth } from "../lib/auth";

test("production artifact serves scoped project and persistent Artifact from isolated DB", async ({ page, context }) => {
  const userId = "v3-prod-" + randomUUID(); let workspaceId = ""; let passed = false;
  const observations: Array<{ route: string; status: number }> = [];
  try {
    await db.user.create({ data: { id: userId, name: "V3产物验证", email: userId + "@test.invalid" } });
    workspaceId = (await db.workspace.create({ data: { name: "V3产物隔离", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
    const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "已保存项目读取" } });
    const branch = await db.draftBranch.create({ data: { workspaceId, projectId: project.id, createdById: userId, updatedById: userId, title: "隔离正文", workingBody: "只读取授权测试成果。" } });
    const artifact = await db.artifact.create({ data: { workspaceId, projectId: project.id, createdById: userId, draftBranchId: branch.id, title: "隔离正文" } });
    const session = await db.session.create({ data: { userId, token: randomUUID() + randomUUID(), activeWorkspaceId: workspaceId, expiresAt: new Date(Date.now() + 3600000) } });
    const require = createRequire(path.resolve("apps/web/package.json"));
    const cookies = require(require.resolve("better-call", { paths: [path.dirname(require.resolve("better-auth/cookies"))] }));
    const signed = await cookies.serializeSignedCookie("teardown-test.session_token", session.token, (await auth.$context).secret, { path: "/", httpOnly: true, sameSite: "lax" }) as string;
    const pair = signed.split(";")[0]!, separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: "http://localhost:3016" }]);
    const response = await context.request.get(`/api/projects/${project.id}/artifacts/${artifact.id}`);
    observations.push({ route: "GET scoped Artifact", status: response.status() });
    expect(response.status()).toBe(200); expect((await response.json()).content).toBe(branch.workingBody);
    const opened = await page.goto(`/dashboard?project=${project.id}&node=artifact:${artifact.id}`);
    observations.push({ route: "GET project workspace", status: opened!.status() });
    expect(opened!.status()).toBe(200);
    await expect(page.getByLabel("成果正文", { exact: true })).toHaveValue(branch.workingBody, { timeout: 30000 });
    passed = true;
  } finally {
    await mkdir("output/v3-quality", { recursive: true });
    await writeFile("output/v3-quality/production-smoke.json", JSON.stringify({ observations, status: passed ? "PASS" : "FAIL", providerCalls: 0, scope: "Actual built production server, isolated test DB. Not customer deployment or real generation." }, null, 2));
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect();
  }
});
