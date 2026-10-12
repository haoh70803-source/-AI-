# 研究中心 V5 Lite 交付记录

日期：2026-10-10。验证等级：V1，加执行用户要求的隔离生产构建。

## 范围与实现

CURRENT IMPLEMENTATION：研究中心首屏以找题材、拆视频、学方法三个入口和现有账号研究工作区为主。默认展示老师筛选；原问题研究、资料选择、研究范围、私人研究提示及最近会话保留在展开区域。带原有资料、账号、趋势、项目或研究模板参数进入时，问题区域自动展开。

老师和对标复用原工作区，仅按现有 purpose 参数选择目的。账号读取、筛选、排序、作品倍数计算、分类、导入、同步、报告与作品详情链接均继续调用原能力。共享工作区提取自原 benchmarks/page.tsx，没有新建平行业务实现。

继续 AI 创作跳转到已有 /projects 入口。原有明确确认后分享、研究带入项目与拆解报告功能继续保留，本次不新增自动传递。

只修改研究中心前端及其定向测试。数据库、API、Service、依赖锁文件、全局导航、主题配置均未修改。已有未提交改动保留，不属于本任务产物。按用户“直接对源代码进行修改”的指令，在原工作区 integration/github-safe-20261010 施工；未创建、切换分支，未暂存、提交或推送。

## 修改文件

- apps/web/app/(app)/research/new/page.tsx：首屏、复用工作区、问题与会话展开区域。
- apps/web/app/(app)/research/benchmarks/page.tsx：复用原工作区组件的路由入口。
- apps/web/app/(app)/research/teardown/page.tsx：三个工具入口与继续创作跳转。
- apps/web/components/research/benchmark-workspace.tsx：从原路由提取账号工作区，调整标题、外框和空状态，保留原业务操作。
- apps/web/components/research/research-tools.tsx：统一研究入口与创作链接。
- apps/web/components/research/research.css：研究中心局部单列、卡片、工作区、窄屏样式；使用既有主题变量。
- apps/web/tests/research-lite.test.tsx：定向 UI 回归和脱敏本地浏览器预览。
- apps/web/vitest.research-navigation.config.ts：在已有无数据库 UI 测试配置中加入本任务测试。
- docs/RESEARCH_V5_LITE_20261010.md：本记录。

## 功能与验证矩阵

| 链路 | 当前证据 | 未覆盖项 |
| --- | --- | --- |
| 三个入口 | 定向测试校验原路由、目的参数与选中状态 | 登录后的真实页面跳转未做端到端验收 |
| 模式切换与筛选 | 保留原 GET 表单字段、选中值、隐藏 purpose、原目的链接；静态浏览器展开更多筛选通过 | 真实数据库筛选查询未执行 |
| 添加账号 | 原组件、导入 API 和权限判断保留；测试验证对话框渲染及只读提示 | 真实第三方导入、账号写入未执行 |
| 作品榜 | 示例账号、已保存作品、倍数、统计和详情链接渲染通过 | 真实采集与真实数据榜单未验收 |
| 空状态 | 无匹配账号时显示原因、调整建议和全部账号入口 | 没有模拟所有上游读取异常；异常继续使用原处理 |
| 问题研究与会话恢复 | 原表单保留；参数进入自动展开；历史记录链接保留 | 模型调用、运行、重新打开结果未执行 |
| 深浅主题 | black-titanium 和 light 各自截图并检查布局 | 包含全局侧栏的真实应用整体截图未执行 |
| 窄屏 | 1440、768、390 宽度检查文档横向溢出及展开后布局 | 特殊设备与浏览器未验收 |
| 权限 | 原 requireWorkspace、Service scope、canWrite 和只读状态保留 | 未新增数据库权限集成测试 |
| 其他模块 | 改动边界审查，未修改全局外壳及其他业务模块 | 不代表全仓 E2E 验收 |

## 本次执行

- 定向 ESLint：本任务 TS/TSX 和测试配置通过，零警告。
- `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false`：正常本地权限下通过。先前沙箱执行产生依赖读取/解析错误，未用关闭类型规则处理。
- `$env:RESEARCH_LITE_PREVIEW="1"; node node_modules/vitest/vitest.mjs run --config apps/web/vitest.research-navigation.config.ts apps/web/tests/research-lite.test.tsx`：7 项通过，使用 Mock 和静态浏览器，不访问数据库。
- 已有配置定向回归：研究导航 3 项失败，报错为侧栏 GlobalSearch 调用 useRouter，而旧导航测试 Mock 未提供。侧栏文件本次施工前已有未提交修改；本任务未修改它或弱化测试。该轮共 19 项通过、3 项失败、2 项跳过，随后本任务新增并通过账号榜单测试。
- `git diff --check`：通过。
- 隔离构建：通过。使用 `node scripts/local-release.mjs build`，沿用仓库构建隔离和网络保护。最终产物 `release-20261010T113751Z-d68767a2`：BUILT、exitCode=0、networkDenied=0、liveFilesUnchanged=true、sourceUnchanged=true；日志 output/research-v5-lite/build-final.log。前两轮编译通过，但施工中的 research.css 变化使一致性门禁失败；最终结果来自停止修改源码后的完整重跑。
- 未执行全仓测试、真实数据库集成测试或真实第三方调用；不能宣称全量验收通过。

## 预览与截图

静态 UI 预览：http://127.0.0.1:3048 。已校验 HTTP 200。只展示脱敏示例，业务链接请在运行中的原应用使用。

启动：在仓库根目录执行 `node output/research-v5-lite/preview-server.mjs`。已启动的预览只监听本机 3048 端口，不使用数据库或模型配置。业务应用使用既有 `pnpm dev:web` 入口，并打开 /research/new；不要重复启动占用同一端口的服务。

改造前：output/research-v5-lite/before-1440.png，从 HEAD 页面源码用相同示例输入渲染，不包含用户真实数据。

改造后：output/research-v5-lite/black-titanium-1440.png、light-1440.png、black-titanium-768.png、light-768.png、black-titanium-390.png、light-390.png。

已有账号示例：output/research-v5-lite/populated-1440.png；预览 /populated。改造前视觉预览 /before。

## 遗留风险与回滚

CURRENT IMPLEMENTATION GAP：原账号工作区在离线环境中只允许定位已保存账号，新账号识别、第三方同步与 AI 分析仍受原授权和环境限制。此次没有将静态示例当作真实接通，也没有扩展这些能力。

首页增加原账号工作区的数据读取，沿用已有服务读取上限；本次不优化后台查询。默认老师筛选可能为空，用户可切换全部账号设置学习目的或选择对标。

回滚仅涉及本任务文件与局部样式，恢复原研究页布局和工作区路由即可；无需数据迁移或数据恢复。原目录包含他人改动，回滚必须精确处理本任务 diff，禁止整仓 reset 或覆盖既有修改。

Git 状态：READY_TO_STAGE。未执行 git add、commit、push。
