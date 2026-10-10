# 鑫世界 AI 工作台

当前产品方向：以项目为长期容器，持续对话、读取资料、研究、选择可选 Skill，并保存和继续编辑成果。权威规则：[PRODUCT.md](PRODUCT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[LEGACY.md](LEGACY.md)、[AGENTS.md](AGENTS.md)。当前 Web 实现与本地优先桌面目标的差距仍存在，不表示桌面交付已完成。

本 checkout 的 origin 为 [haoh70803-source/-AI-](https://github.com/haoh70803-source/-AI-)；默认分支 main。安全集成分支为 integration/github-safe-20261010，是否已推送以 [合并总结](GITHUB_MERGE_SUMMARY.md) 为准。

需要 Node.js 24.21.0、pnpm 11.19.0；项目是 Next.js/React + Prisma/PostgreSQL + BullMQ/Redis 的 pnpm 多包仓库，资料存储与 ASR/外部 API 需独立准备。

`ash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
node scripts/verify-build-artifact.mjs
`

新同事从 [GitHub 独立运行与部署说明](docs/GITHUB_DEPLOYMENT.md) 开始：使用 config/environments/local-review.env.example 创建被忽略的 .env.local-review，通过 LOCAL_PROFILE_FILE 选择私有配置。根 .env.example 是历史共享变量参考；旧 dev:real/dev:up 不是当前默认入口。无需复制维护者的 output、node_modules 或私人数据。

当前代码含项目 Agent、文本成果版本编辑、资料读取、研究及飞书相关能力；完整业务、真实 Provider 和存储链路的本轮验证状态见 [完整性报告](CODE_INTEGRITY_REPORT.md)。Mock 成功不等于真实 API 或内容质量验收成功。历史 README 见 [追溯副本](docs/README_HISTORY_20261010.md)，其中仓库、阶段和旧命令不作为当前操作依据。

交付证据：[合并前审计](GITHUB_PRE_MERGE_AUDIT.md)、[差异](GITHUB_DIFF_REPORT.md)、[冲突处理](GITHUB_CONFLICT_RESOLUTION.md)、[代码完整性](CODE_INTEGRITY_REPORT.md)、[干净克隆](CLEAN_CLONE_TEST_REPORT.md)、[部署就绪](DEPLOYMENT_READINESS_REPORT.md)、[合并总结](GITHUB_MERGE_SUMMARY.md)。生产部署与 main 合并必须另行批准；此仓库的 GitHub Actions 没有自动部署步骤。
