# 资源中心最小 UI 改造 · 2026-10-10

STATUS：源码已修改，定向 UI、类型检查、ESLint 与正式构建通过，等待人工验收。真实平台验收尚未完成。

## 实际代码审计与边界

| 对象 | 实际入口 / 依赖 | 本次处理 |
| --- | --- | --- |
| 资源中心 | `apps/web/app/(app)/library/page.tsx` → `requireWorkspace` → `listLibrarySources` | 标题、三个核心导航、常显工具区、空状态 |
| 隐藏筛选 | 同一页面原 `details.xin-content-tools`，搜索 / 排序 / 布局在 `components/library/library-toolbar.tsx` | 去掉折叠交互，保持原 URL 参数 |
| 资料查询 | `server/library.ts`：search、sourcePlatform、sourceType、status、tag、collection、sort、page、pageSize、view | 不修改服务；保留搜索、分页、已有 tag/collection/platform 参数 |
| 状态 | 不传 status 默认排除 ARCHIVED；READY 仅代表已就绪 | “正常（未归档）”不错误映射到 READY，保留其他实际状态 |
| 排序 | newest / oldest / title；旧 view=RECENT 覆盖排序 | 改变排序时清除 RECENT 别名，保留其他查询条件 |
| 创作成果 | `getProjectListView` → 最近 12 个项目 → `listArtifacts` → 前 30 份可访问成果 | 保留边界及 projectId/artifactId；不显示无效的资料筛选与资料分页 |
| 卡片 | 页面内 `AssetCard`、`AssetThumbnail`、`LibraryCardAction` / `LibraryCardMenu` | 保留实现和资源 ID；操作入口常显；局部取消悬停位移 |
| 飞书 | `/library/feishu` → `FeishuLibrary` → `/api/feishu` → `server/knowledge/feishu-context.ts` → integrations | 复用现有连接、订阅、同步、检索及权限，不创建接口或任务 |
| Wiki | `FeishuWikiBrowser` → `/api/feishu/browse`，`FeishuKnowledgeSubscriptions` | 保留目录、分页、连接版本、失败与撤权语义 |
| 设计 Token | globals / black-titanium / apple-workbench CSS，surface、border、text、spacing 变量 | 仅追加资源中心局部规则，验证两种主题与 1440 / 768 / 390 宽度 |

CURRENT IMPLEMENTATION GAP：`LibraryQuery` 不支持 `sourceProvider`，也没有普通资料统一的知识分类参数。现有资料列表包含原始资料与同步的飞书资料，不能通过更换按钮文案变成真正的来源过滤。本次采用“来源入口”导航，飞书进入现有集成页面；明确展示列表包含范围，不对分页结果作伪筛选。知识条目、已确认事实、品牌与 IP 背景作为知识管理入口，未冒充来源或分类字段。

飞书现有用途分类 METHOD / CASE / BRAND / OTHER 沿用原页面。普通资料已有 tag / collection 查询能力，但当前页面没有列举分类选项的现成读取模型；本次保留这些历史 URL 参数，没有新增接口、模型或第二套分类。若要求跨来源、跨成果统一分类筛选，需要另行授权扩展查询契约。

风险：全部资源中，类型 / 状态 / 排序只作用于资料；搜索同时匹配近期成果，页面有范围提示。真实来源统一过滤、统一知识分类、完整成果搜索不属于本次已实现能力。

## 实际修改文件

1. `apps/web/app/(app)/library/page.tsx`：三类导航、常显工具区、飞书入口、保留原业务链接、空状态与成果分页纠正。
2. `apps/web/components/library/library-toolbar.tsx`：状态选择、排序别名修复、保留尚未提交的搜索词、成果计数文案。
3. `apps/web/components/library/asset-library.css`：紧凑装饰区、工具区、飞书入口、稳定卡片操作、响应式规则。原有封面 contain 修改保留，非本任务新增。
4. `apps/web/components/library/feishu-library.tsx`：连接管理锚点、读取中 / 未连接 / 已断开 / 已启用 / 异常状态，返回资料库保留主分类。
5. `apps/web/tests/resource-center-lite.test.tsx`：页面 SSR、真实客户端工具栏与卡片操作的隔离回归、示例截图。
6. `apps/web/vitest.research-navigation.config.ts`：扩展已有轻量 UI 配置，收录本次测试及两个既有飞书 UI 测试；原规则保留。
7. 本报告。

不修改数据库、迁移、API 契约、共享组件契约、全局导航、其他业务页面或依赖锁文件。

## 功能验证矩阵

所有数据均为本地示例 / mock，不连接或写入真实业务数据库。

| 链路 | 本次证据 | 限制 |
| --- | --- | --- |
| 三主导航 / 查询参数 | 实际页面 SSR、真实 href、分类与项目 / 资源 ID 保留 | 未在带登录的完整 Next 应用中端到端点击所有路由 |
| 组合筛选 / 搜索 / 排序 | 真实 LibraryToolbar DOM change，验证 URL 保留与清除 page / RECENT；SSR 验证服务入参 | 数据库真实查询结果未验收 |
| 空状态 / 只读角色 | 资料为空、筛选为空、VIEWER 无写入口；飞书来源无通用删除菜单 | 服务端权限逻辑未改，未重跑数据库权限集成测试 |
| 卡片归档 / 恢复 / 删除 | 真实菜单 / 确认框，验证方法、选中 sourceId、恢复 body、409 显示失败 | 请求为 mock，不代表真实删除数据已验收 |
| 飞书连接 | 未配置、已断开、已启用、403 读取失败状态与只读提示 | “已启用”不冒充远程测试连接成功 |
| Wiki 读取 / 空 / 权限 / 同步 | 两套既有 UI 测试覆盖目录分页、权限失败、失效连接、空列表、原文、订阅启停与同步请求 | mock 通过，不代表真实飞书连接 / 权限 / 同步成功 |
| 深浅主题 / 响应式 | 两主题 × 1440 / 768 / 390，实际页面 markup + 现有 CSS，检查横向溢出；卡片悬停尺寸位置稳定 | 页面主体截图，未包含全局侧栏；上传按钮用替身，未测试上传流程 |
| 详情 / 预览 | 保留并断言 `/library/{id}` 和成果 projectId / artifactId 链接；Wiki 预览由既有 UI 测试覆盖 | 完整资料详情、真实文件预览未端到端验证 |

定向测试命令（仓库根目录）：

```powershell
$env:RESOURCE_LITE_PREVIEW="1"
node node_modules/vitest/vitest.mjs run --config apps/web/vitest.research-navigation.config.ts apps/web/tests/resource-center-lite.test.tsx apps/web/tests/feishu-wiki-browser.test.tsx apps/web/tests/feishu-knowledge-subscriptions.test.tsx
```

结果：3 个文件、33 项测试通过。Vite 提示未来 native config loader 的 CommonJS / ESM 兼容警告，未关闭或隐藏。

```powershell
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
node node_modules/eslint/bin/eslint.js "apps/web/app/(app)/library/page.tsx" apps/web/components/library/library-toolbar.tsx apps/web/components/library/feishu-library.tsx apps/web/tests/resource-center-lite.test.tsx apps/web/vitest.research-navigation.config.ts --max-warnings=0
node scripts/local-release.mjs build
git diff --check
```

TypeScript（完整 web 包）、定向 ESLint、diff --check 已通过。正式构建通过：`release-20261010T115313Z-86c9e335`，`status=BUILT`、`exitCode=0`、`networkDenied=0`、`liveFilesUnchanged=true`、`sourceUnchanged=true`。未运行全仓测试，不能声明全仓或真实平台验收通过。

## 截图与预览

`output/resource-center-lite/` 保存：`before-1440.png`、`black-titanium-{1440,768,390}.png`、`light-{1440,768,390}.png`、`before.html`、`preview.html`、`build.log`。

改造前使用修改前实际页面源码及样式，改造后使用当前实际页面源码及样式；两者使用相同隔离示例数据。不是生产数据截图。HTML 可本地打开查看，静态预览不连接业务服务。

## Git 与回滚

当前分支：`integration/github-safe-20261010`；既有 HEAD：`caf7162`。按用户后续“直接修改源码”的要求在当前源码施工，未新建或切换分支。当前工作树已有其他任务未提交改动，本次只在上述文件内追加最小修改。

未执行 git add / commit / push；本次没有新增提交记录。状态 READY_TO_STAGE（仅指可审阅的本次差异，不代表全部工作树属于本任务）。工作树 / 分支隔离要求未达成，明确记录而不虚报。

回滚只涉及本次前端及测试 hunk；需保留 asset-library.css 与测试配置的既有修改。没有数据库或远程副作用，无需数据回滚。不要整文件覆盖或 reset 混合工作树。

## 横幅比例修订 · 2026-10-10

根据用户对超宽横幅裁切的反馈，仅调整 `asset-library.css` 的资源中心横幅规则：原图在右侧按自然宽高比缩小，上下左右渐隐融入当前主题背景；手机限制图片占比，文字保持清晰。原因是原先 `object-fit: cover` 配合全宽、156px 高度造成大幅裁切，并非原始图片被非等比拉伸。

本轮验证：现有资源中心 7 项定向 UI 测试通过，深浅主题 1440 / 768 / 390 截图通过；另检查 2272 / 390 / 320 两主题，图片渲染比例与原图一致且无横向溢出。`git diff --check` 通过。仅 CSS 小改，本轮未重复 TypeScript、ESLint 或正式构建，上文结果属于前一轮。未暂存、提交或推送。

局部预览：`output/resource-center-lite/banner-black-titanium-2272.png`、`banner-light-320.png`。修改前 HTML / CSS 保留在 `banner-before.html` / `banner-before.css`。
