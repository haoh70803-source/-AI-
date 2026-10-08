import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { expect, test } from "@playwright/test";

const suffix = randomUUID();
const email = `v1-acceptance-${suffix}@example.test`;
const password = "safe-v1-acceptance-password";

test.afterAll(async () => {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } });
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});

test("V1 UI happy path: 素材 → 创作 → 审核 → 排期 → 人工发布", async ({ page, context }) => {
  test.skip(process.env.MOCK_MODE !== "true", "V1 fixture acceptance requires explicit MOCK_MODE");
  test.setTimeout(240_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3000" });

  await page.goto("/register");
  await page.getByLabel("姓名").fill("V1 Acceptance Creator");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("V1 验收内容空间");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/settings/creator-profile");
  await page.getByLabel("显示名称").fill("Creator A");
  await page.getByLabel("我的定位").fill("企业经营 / AI / 老板认知");
  await page.getByLabel("目标受众").fill("企业老板、管理层");
  await page.getByLabel("常做领域（每行一项）").fill("企业经营\nAI 应用");
  await page.getByLabel("表达语气").fill("直接、有观点、少营销腔");
  await page.getByLabel("禁用词（每行一项）").fill("100%有效\n保证成功");
  await page.getByRole("button", { name: "保存创作画像" }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();

  await page.goto("/library");
  await page.getByRole("button", { name: "收录内容" }).click();
  await page.getByLabel("标题（可选）").fill("老板用 AI 最容易犯的一个错");
  await page.getByLabel("正文").fill("很多老板把 AI 当作答案生成器，却没有先定义经营问题。AI 应该放大经营判断，而不是替代老板判断。");
  await page.getByLabel("备注（可选）").fill("V1 UI happy path");
  await page.getByRole("button", { name: "提交收录" }).click();
  await page.getByRole("link", { name: "查看资料" }).click();
  await expect(page.getByRole("heading", { name: "老板用 AI 最容易犯的一个错" })).toBeVisible();

  await page.getByLabel("新标签").fill("企业经营");
  await page.getByRole("button", { name: "添加标签" }).click();
  await page.getByLabel("新项目名称").fill("老板如何正确使用 AI");
  await page.getByRole("button", { name: "用此素材新建项目" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/studio$/);

  await page.getByRole("button", { name: "查看素材依据" }).click();
  await page.getByRole("dialog", { name: "素材依据" }).locator("summary").filter({ hasText: "新增素材依据" }).click();
  await page.getByLabel("内容类型").selectOption("VIEWPOINT");
  await page.getByLabel("关联素材").selectOption({ label: "老板用 AI 最容易犯的一个错" });
  await page.getByLabel("原文摘录").fill("很多老板把 AI 当作答案生成器，却没有先定义经营问题。");
  await page.getByLabel("观点或结论").fill("AI 应该放大经营判断，而不是替代老板判断。");
  await page.getByRole("button", { name: "新增素材依据" }).click();
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "编辑方案" }).click();
  await page.getByLabel("主题").fill("老板如何正确使用 AI");
  await page.getByLabel("建议切入角度").fill("从经营问题而不是工具功能切入");
  await page.getByLabel("目标受众").fill("企业老板、管理层");
  await page.getByLabel("素材核心观点").fill("AI 应该放大经营判断，而不是替代老板判断。");
  await page.getByLabel("关键要点（每行一点）").fill("先定义经营问题\n区分事实和假设\n人工校验输出");
  await page.getByLabel("建议结构（每行一点）").fill("判断\n原因\n方法\n提醒");
  await page.getByRole("button", { name: "保存创作方案" }).click();
  await expect(page.getByRole("status")).toHaveText("创作方案已保存");
  await page.getByRole("button", { name: "确认并开始创作" }).click();

  await page.getByRole("button", { name: /2 · 深度创作/ }).click();
  await expect(page.locator("span:visible").filter({ hasText: "MOCK MODE" }).first()).toBeVisible();
  await page.getByRole("button", { name: "生成深度创作包" }).click();
  await page.getByRole("button", { name: "保存创作包" }).click();
  await page.getByRole("button", { name: "生成 GPT 创作任务包" }).click();
  await page.getByRole("button", { name: "复制给 GPT" }).click();
  await expect(page.getByText("已复制，请前往 ChatGPT 网页版完成高级创作", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "导入 GPT 成稿" }).click();
  await page.getByLabel("GPT 成稿标题").fill("老板用 AI，第一步不是选工具");
  await page.getByLabel("GPT 成稿正文").fill("很多老板用 AI，第一步不是选工具，而是先定义经营问题。把事实、经验和假设分开，再让 AI 整理信息、比较方案和生成草稿。最后必须由人核对输出。AI 的价值不是替代老板判断，而是放大已经想清楚的经营判断。");
  await page.getByLabel("GPT 成稿备注").fill("V1 E2E 模拟 GPT 网页成稿");
  await page.getByRole("button", { name: "保存为母稿" }).click();
  await expect(page.getByText("GPT 网页成稿", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /3 · 平台内容与审核/ }).click();
  await page.getByRole("button", { name: /^公众号/ }).click();
  await page.getByRole("button", { name: "生成公众号" }).click();
  await page.getByRole("button", { name: "应用为公众号版本" }).click();
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect(page.getByRole("button", { name: "公众号 待审核" })).toBeVisible();
  await page.getByRole("link", { name: "查看审核" }).click();
  await expect(page.getByText("未发现规则问题。", { exact: true })).toBeVisible();
  await page.getByLabel("审核备注").fill("已核对来源边界和表达风险。");
  await page.getByRole("button", { name: "批准" }).click();
  await expect(page.getByText("内容已批准", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "加入发布中心" }).click();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  const scheduledLocal = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T10:00`;
  await page.getByLabel("计划发布时间").fill(scheduledLocal);
  await page.getByRole("button", { name: "按此时间排期" }).click();
  await expect(page).toHaveURL(/\/calendar\/tasks\/[^/]+$/);
  await page.getByRole("button", { name: "复制完整发布包" }).click();
  await page.getByLabel("外部发布链接").fill("https://example.test/v1-e2e");
  await page.getByLabel("发布备注").fill("V1 E2E：未连接真实平台，模拟人工发布完成。");
  await page.getByRole("button", { name: "标记已发布" }).click();
  await expect(page.getByText("已发布", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("已人工标记为发布。", { exact: true })).toBeVisible();
});
