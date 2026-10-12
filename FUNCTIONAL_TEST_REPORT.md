# 前端功能与质量测试

日期：2026-10-10。只使用本轮执行结果；不引用旧 V3 / V4 的通过数字为当前验收。

## 当前结果

| 检查 | 结果 | 当前证据 |
| --- | --- | --- |
| 完整 Web TypeScript | PASS | `output/frontend-implementation/typecheck.json`，38840ms |
| 本轮 9 个 TS / TSX 文件 ESLint | PASS | `lint-changed.json`；含新增 E2E / 配置 |
| 全量 Web ESLint | FAIL：1 项 | `lint.log`；未修改的后端 `server/ai/control/context-builder-v2.ts:225`，no-useless-assignment |
| 12 个相关模块回归 | 82 PASS / 0 FAIL | `regression.json`；串行执行，隔离测试库 |
| 已登录前端 E2E | PASS：1 个综合测试 | `screenshots/audit.json`；60 次主题 / 路由 / 尺寸检查 + 6 组流程记录 |
| 320px / 768px 重点布局 | PASS | 6 张 extra 完整截图；无页面级横向溢出 |
| 浏览器运行异常 | 0 pageerror | `screenshots/audit.json` 中 errors=[] |
| 生产构建 | PASS | `build.json`；173832ms，源码与 live 文件一致性 true |
| 实际生产产物与控制台 | PASS：1 个综合测试 | `production-smoke.json`；成果 API / 工作区页面 200；两主题 × 两尺寸；console error / pageerror 为 0，Provider 调用 0 |

## 核心链路

测试创建隔离用户与 workspace，通过真实 UI 与现有 API 执行：选择文本资料 → UI 创建项目 → 0 Skill 生成 → 保存为成果 → 编辑 / 预览 → 注入 503 保存失败、正文保留 → 重试保存 → AI 仅修改选区 → 历史恢复 → 继续编辑 → 未保存关闭取消 → 再保存 → 项目导航重开 → 下载校验正文。

上述链路分别在 1440px 与 390px 运行。生成使用显式 MOCK Provider；真实项目、资料引用、Artifact、DraftRevision 与权限持久化使用隔离数据库，不以页面中的静态字符串代替接口结果。

附加检查：VIEWER 可以读取成果，但 UI 不允许写入且接口返回 403；同版本延迟刷新不丢选区；演示 CSV / 复制复盘保留演示来源；主题切换刷新后不变；320/768 布局；手机导航文字、抽屉展开、导航后关闭、全局搜索打开 / Escape 关闭。

数据页读取真实 `/api/video-data`，测试仅在自己创建的空间植入标明 `UI_SYNTHETIC_ACCEPTANCE` 的账号日记录；没有请求拦截伪造这些统计响应。默认页面没有演示标签，三项缺失采集显示“未接入”。测试结束删除本轮空间和用户，不修改真实账号记录。

## 回归覆盖

creation-composer、artifacts、project-agent-core、sidebar-state、sidebar-organization、video-analytics、source-upload、creation-agent、creation-policy、assistant-stream-route、research-project-handoff、auth.integration。12 文件共 82 项，不累加浏览器内部断言为单元测试数。

## 未覆盖与失败记录

- 生产 smoke 首次使用未包含换行空白的标题定位而失败；按实际可访问标题修正定位后同一构建产物通过，首次记录为 `production-smoke-first.json`。没有重新构建或改变页面迎合断言。
- 首次 E2E 停在旧的“项目成果 dialog”定位；当前产品已使用嵌入 section / region。测试定位修正后最终通过，未改变业务来迎合断言。
- 全量 lint 的后端错误在本轮前已修改的用户文件中，本轮未编辑该文件；未通过顺手改后端消除失败。前端增量 lint 单独通过。
- 真实外部模型事实质量、平台授权数据、真实飞书知识读取、所有上传格式的 UI 全链路、全部历史管理按钮、真实负载、跨浏览器和人工体验未重新验收。不以 MOCK 流程或截图通过替代。
- 本轮没有调用收费 Provider，没有 migration deploy，没有生产部署或全仓所有模块测试。

## 复验命令

```powershell
node output/frontend-implementation/run-check.mjs typecheck
node output/frontend-implementation/run-check.mjs lint
node output/frontend-implementation/run-lint-changed.mjs
node output/research-handoff/run-isolated.mjs node_modules/@playwright/test/cli.js test --config apps/web/playwright.frontend.config.ts
node output/frontend-implementation/run-check.mjs build
```

测试环境入口沿用现有 guarded runner，要求隔离数据库可用；拒绝其他数据库目标。浏览器路径可用 `UI_CHROMIUM_PATH` 指定。
