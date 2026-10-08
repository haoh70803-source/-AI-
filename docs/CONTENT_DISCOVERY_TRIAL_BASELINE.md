# Content Discovery 内部试用基线

- Release branch：`release/content-discovery-internal-trial`
- Source baseline commit：`0b69b754b36dcfe2ec72a970a3e5d25afda8a6dd`
- Tag：`content-discovery-internal-trial-v1`
- Date：`2026-09-02`
- Database migration count：`21`

## Core capabilities

1. 内容搜索与快速收录
2. 对标账号与显式作品加载
3. 趋势机会、趋势依据与相关内容
4. 我的选题与参考内容管理
5. 今日内容线索 / 今天值得做
6. 推荐依据
7. 选题 → 内容项目
8. ContentProject → Studio
9. Workspace 隔离、角色权限和显式外部调用

## Known limitations

- 375px 下全局主导航采用横向滚动。
- 当前使用 process memory cache。
- 没有自动趋势清理。
- 没有自动对标同步。
- 没有 CreatorMemory。
- 没有 semantic clustering。
- 没有 vector duplicate detection。
- 真实 Kimi 尚无可用凭证，未执行真实模型 smoke test。

## External provider status

- RedFox：`REAL VERIFIED`
- Local FunASR：`REAL VERIFIED`
- Doubao：`existing fallback`
- Kimi：`NOT_RUN_NO_REAL_CREDENTIAL`
- CreatorMemory：`NOT IMPLEMENTED`
- Auto recommendation：`NOT IMPLEMENTED`
- Cron：`NOT IMPLEMENTED`

## Trial change policy

Release 分支保持稳定。P0/P1 从 `release/content-discovery-internal-trial` 创建 `fix/discovery-trial-<short-name>`，完成 targeted tests 后再合回 release。P2 默认先记录，P3 只记录不开发。
