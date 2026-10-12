# V3 项目闭环验收

日期：2026-10-10。文本资料代表性核心链路 PASS；完整发布验收未通过。

## 环境与真实执行

数据库：`content_center_agent_test_12`，LOCAL_TEST。浏览器：Edge，专用Next进程3016、独立构建目录。用户、工作区、项目、授权合成资料、Skill和成果全部隔离。只读获取现有DeepSeek配置，将不透明加密配置临时复制到隔离工作区，结束删除；不导出凭证。Worker禁用，未改生产资料、真实模型配置或3022服务。

测试：`apps/web/e2e/creation-quality.spec.ts`；配置：`playwright.quality.config.ts`；入口：`node output/v3-quality/run-browser-real.mjs`。真实调用显式启用，常规回归不运行付费测试。

## 两条已通过的真实链路

| 步骤 | 无Skill | 有Skill | 方式 |
| --- | --- | --- | --- |
| 上传授权TXT并读取正文 | PASS | PASS，复用同份资料 | 真实上传API + 隔离对象存储 |
| 创建关联资料的项目 | PASS | PASS | 实际Project API |
| 确认Skill选择 | PASS，0 Skill | PASS，授权测试Skill | 浏览器选择状态、实际请求和Context |
| 生成三段内容 | PASS | PASS | 真实DeepSeek，来源和课时费用核对 |
| 选中首段，对话修改 | PASS | PASS | 浏览器真实键盘选区，实际模型 |
| 未选中内容保持 | PASS | PASS | 对比原文后缀，逐字一致 |
| 保存/应用成果 | PASS | PASS | 实际Artifact版本事务 |
| 关闭项目后重开 | PASS | PASS | 回到首页后重新打开成果 |
| 历史回退 | PASS | PASS | 恢复原稿并新增修订 |
| 导出已保存版 | PASS | PASS | 浏览器下载，文件正文与已保存版一致 |

一个浏览器测试包含两条上述路径，最终退出成功，耗时55.3秒；无Skill闭环26746ms，有Skill23771ms。这是两次单机流程观测，不是Skill加速效果，也不是生产SLA。全过程保留 `output/v3-quality/e2e-real.json`、两份导出文件与截图；各次执行的AIRun和消息另存 `e2e-observed-*.json`，避免失败清理后丢失观测。

上传与项目创建采用实际API，其余操作走浏览器UI；不能据此声称首次使用者亲手操作了上传/新建入口。真实PDF/音视频/图像全链路本轮 NOT TESTED，TXT不能代表所有类型。

## 首轮失败与处理

- 验收导入server-only模块、错误读取不存在的AIRun.latencyMs字段、受限离线开关，以及类型空值问题，均属于测试代码问题，已修正重跑。不存在latency字段，耗时改用真实起止时间。
- 第一次到导出后的记录错误导致2次真实调用用量未完整保存，仍保留失败痕迹并在成本报告说明缺失，不将其当作零费用。
- 一次真实生成称已关联资料没有课时/费用，并输出额外说明，验收FAIL。确认根因是请求没有正文引用，修复明确“按项目资料”读取路径后，两条路径通过。失败回复保留在观察文件。

## 其他关键验收

最终关键回归167项PASS，含上传、Project、鉴权、成员权限、Artifact、跨范围资料、记忆、来源缓存、准入、取消、失败恢复与截断。增加并发保存测试：相同版本的两个同时保存只有一个成功，另一个返回版本冲突。全局容量测试用固定Provider和实际数据库，验证准入与释放，不代表真实32并发吞吐。

| 项目 | 状态 | 限制 |
| --- | --- | --- |
| 权限、跨工作区与只读拒绝 | PASS / 工程 | 固定Provider或模拟API身份，非真实生产账户审计。 |
| 停止、部分文本、重试、SSE错误 | PASS / 工程 | 受控Provider/流式模拟；真实供应商取消计费行为 NOT TESTED。 |
| 输出上限不保存为完整稿 | PASS / MOCK | 注入finishReason=length；真实供应商极限压测 NOT TESTED。 |
| 同对话、用户/空间容量和并发保存 | PASS / 实际DB+固定Provider | 非真实高负载压测。 |
| 实际供应商断网、配额耗尽、长时故障 | NOT TESTED | 未人为破坏真实服务。 |
| TXT浏览器下载及历史恢复 | PASS / REAL链路 | 不是全部导出格式验收。 |

机器报告：`regression-final.json`、`material-fix-regression.json`。类型、lint、构建最终结果见 RELEASE-READINESS；初轮失败和最终结果分开，不将历史PASS当本轮证据。

补充固定Provider浏览器测试1项PASS，覆盖桌面1440与移动390宽度。发现并修复历史回退延迟刷新重新打开成果窗口、阻挡后续AI改稿的问题；修复后测试19.8秒。该次工程测试没有新增付费调用，截图见 `output/creation-agent-quality/`。

## 正式产物运行验证

既有隔离发布构建PASS，产物 `release-20261010T041810Z-f0f98f77`。用 `creation-production-smoke.spec.ts` 和 `playwright.production-smoke.config.ts` 启动该实际产物的Next生产进程，仅读写独立测试空间，结束删除合成用户/项目。已保存Artifact API返回200且正文一致，项目页面返回200并在成果编辑器显示对应正文，1项PASS（3.2秒）。记录 `output/v3-quality/production-smoke.json`；模型调用0次。此前真实生成完整链路使用独立开发进程，生产产物本次只验收读取，不将两者混称为生产模式真实生成或客户环境部署。
