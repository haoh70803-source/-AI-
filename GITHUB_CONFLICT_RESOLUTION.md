# GitHub 冲突处理记录

记录时间：2026-10-10T18:14:15+08:00（Asia/Singapore）。集成源码参考 HEAD：`783658367057ecd0f8404cbbcc3fb74489685b0c`。详细原始日志在被忽略的 `output/github-audit/`；私有日志和备份没有上传。

**代码合并冲突数：0。** 不存在需要采用ours/theirs的hunk。验证命令：`git diff --quiet 242f7b911e369d4c93d0deccc02ee368cfd90137 eac630b63434a3cdfa99990a6f7f980fae06674e` exit0；`git merge --ff-only origin/main` 成功快进；`git ls-files -u` 应为空。未使用force push、reset、clean、stash、rebase、unrelated-histories或任何全量ours/theirs策略。

## 实际处置

| 项目 | 处理 | 理由/验证 |
| --- | --- | --- |
| 远程PR合并记录 | 保留历史并快进 | 共同祖先已是本地HEAD，远程tree相同 |
| 未提交跨模块代码 | 在466adfd原样快照 | 用户任务要求保护完整本地版本；private QA产物例外仅保留本地 |
| lint无效赋值 | 去掉methods多余的 `=[]` 初始赋值 | if/else均赋值；不改变Skill选择/鉴权行为，lint/typecheck复验 |
| 测试字面量类型 | seven report fixtures添加TeardownReport类型 | 保持严格schema字面量类型，没有删除/跳过测试 |
| 纯类型契约边界 | 函数移至lib/reference-scope.ts，更新UI/服务/测试三处导入 | 保留函数行为；原边界测试33/33，通过现有浏览器打包检查 |
| 私有profile依赖 | local-web/local-release允许LOCAL_PROFILE_FILE显式选择 | 保留既有默认入口和严格profile guard；不回退他人环境 |
| 运行时资源 | 构建复制已提交vendor并保留manifest | 老路由仍读取文件；不能因为构建编译成功忽略运行时缺失 |
| 浏览器绝对路径 | frontend配置默认使用Playwright安装浏览器，仅保留显式UI_CHROMIUM_PATH | 不把维护者E盘路径作为新开发者前提 |
| 构建产物 | 验证BUILD_ID、manifest、server/static与SHA-256 | 不能以Next compile日志替代receipt通过 |

## 尚未解决的判断项

- `content-projects.test.ts` 期待PROJECT_NOT_FOUND，当前返回PROJECT_FORBIDDEN；未自动改安全语义。
- 部分UI结构断言仍期待旧文案/DOM，部分fixture读取本地缺失历史文件；未恢复旧UI、删断言或改为假通过。
- 不同测试分别要求LOCAL_TEST、LOCAL_REVIEW、agent数据库、HTTP服务和不同端口；不得直接改连接串指向正在使用的review实例。
- vendor来源标明CC BY-NC 4.0；部署商业适用性需要产品负责人另行审查。
- 生产仓库/分支/健康检查和存储替代方案未确定，保持未部署。

这些是验收/部署判断项，不是已解决的Git冲突；详细失败证据见CODE_INTEGRITY_REPORT.md。

## 干净环境修复补充

- 新目录 `pnpm typecheck` 最初失败：缺少 Next 生成的 PageProps/RouteContext。按本机 Next 官方文档，将web脚本改为 `next typegen && tsc -p tsconfig.json --noEmit`。干净复验8/8通过；没有关闭类型检查。`next-env.d.ts`由该命令生成后提交。
- 创作E2E最初仍查询旧modal dialog，而当前UI使用内嵌region。逐项核对当前实现后更新定位器和编辑器持续可见/输入聚焦断言；保留锁定、后端403、保存、重新打开、版本恢复、局部AI编辑与移动端溢出检查。最终该场景1通过、0失败、0skip，68.7秒。没有改产品UI以迎合旧测试。
- `git ls-files -u`实际为空；权威文件相对466adfd的 `git diff --quiet` exit0。
