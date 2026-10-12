# 数据中台：保持视觉的后端适配设计

日期：2026-10-10。状态：EXPERIMENT。用户已授权补充设计；本文件不修改 PRODUCT / ARCHITECTURE，不授权提前实现 FUTURE 内容经营域。本次实现仅为独立原型的数据投影与方案预览，没有修改正式 API。

## 1. 固定视觉，明确数据语义

保留两套主题、原统计分区、卡片尺寸体系、图表类型和交互。数据总览仍为4卡片→全宽双线面积图→堆叠/排名/环图；分析视图仍为上3区→下3区。真实接入只替换数据与 availability 状态，不按数据来源重新布置页面。

原型提供“补充方案 / 现有能力”选择器。补充方案中热力、留存与设备显示明确标记的视觉样例；现有能力中对应位置显示待接入。两个模式复用同一布局，不能把补充方案的样例当作已有后端返回。

## 2. 组件—已有字段—计算—补充层

| 组件 | 现有数据 | 映射或计算规则 | 补充设计 |
| --- | --- | --- | --- |
| 今日曝光/播放/互动/净增粉丝 | video-data.metrics、changes、coverage、observedAt | 今日快照；不随周期筛选改为周期总量。互动=赞+评+分享+收藏 | 统一标注时区、截至时间、阶段快照及记录覆盖 |
| 双线面积趋势 | trend、comparisonRecords | 当前窗口与上一等长窗口；同指标同单位，未覆盖/缺失保留null | 将按日/按月聚合结果规范化为稳定series，不乘模拟系数 |
| 互动构成堆叠 | records.likes/comments/shares/saves | 选定窗口同账号范围的4类合计 | 返回total及denominator定义 |
| 账号播放排名 | accounts + records.plays | 各账号周期播放量，降序，单账号筛选仍能呈现 | 无需新增业务表；明确缺失记录覆盖 |
| 平台贡献环图 | accounts.platform + records.plays | 以同一账号集合和日期集合按平台求和 | 平台合计=排名合计=同窗口播放合计 |
| 日度柱状与快照 | trend/records + contents | 最近至多16日播放；今天大数字；内容阶段保持业务状态 | 缺失柱展示缺失标记；不命名为实时在线用户 |
| 多序列走势 | trend / records | 同一日期的播放、曝光、互动；窗口总量一致 | 曝光有null时总量不可完整计算，显示— |
| 时段热力图 | 当前无小时行为维度 | 不能从录入时间推导观众行为 | 后续提供带来源/availability的小时统计或明确业务不同的操作热度，不能混名 |
| 留存矩阵 | 当前无用户队列/去重访问事件 | 不能从发布日度记录推导留存 | 必须先确认观测对象、可获取合法数据与去重标识 |
| 设备环图 | 当前无观看设备维度 | 不能把账号/平台贡献冒充设备占比 | 后续来源提供真实设备分布；未知设备独立分类 |
| 异常/运营任务 | alerts、tasks、contents | 使用服务端条件、负责人和editable；不凭低播放推断限流 | 详情动作回到关联账号/任务；当前原型入口已有 |

## 3. 数据投影而非平行业务服务

正式接入优先复用 video-operations/readVideo 与既有业务记录，在应用读取边界扩展必要聚合；不另建“V2数据中台服务”复制账号、任务或采集逻辑。

建议新增统计投影 DTO（契约草案，未实现）：

```ts
type Availability =
  | 'AVAILABLE' | 'PARTIAL' | 'NO_DATA'
  | 'UNSUPPORTED_SOURCE' | 'NOT_CONFIGURED';

type MetricMeta = {
  metric: string;
  unit: 'COUNT' | 'PERCENT';
  scope: { accountIds: string[]; platform?: string };
  window: { start: string; end: string; timezone: 'Asia/Shanghai' };
  observedAt: string | null;
  availability: Availability;
  coverage: { recorded: number; expected: number };
  isFinal: boolean;
  source: { kind: 'DAILY_RECORD' | 'PLATFORM_SNAPSHOT' | 'OWNED_EVENT'; label: string };
};

type AnalyticsProjection = {
  snapshot: { meta: MetricMeta; plays: number|null; exposures: number|null;
    interactions: number|null; netFollowers: number|null };
  trend: { meta: MetricMeta; labels: string[];
    series: { metric: string; values: (number|null)[] }[] };
  interactionMix: { meta: MetricMeta; total: number; items: { label:string; value:number }[] };
  accountRanking: { meta: MetricMeta; items: { accountId:string; value:number }[] };
  platformMix: { meta: MetricMeta; total: number; items: { platform:string; value:number }[] };
  hourly?: { meta: MetricMeta; weekday:number; hour:number; value:number|null }[];
  cohort?: { meta: MetricMeta; start:string; week:number; active:number|null; base:number|null }[];
  devices?: { meta: MetricMeta; device:string; value:number }[];
};
```

这是字段设计，不是仓库新增的正式DTO。原型 analytics-adapter.js 用同一组固定日度记录验证前三类聚合；扩展图形复用现有图表，标记 DESIGN_FIXTURE，不向服务器发送请求。

## 4. 接口补充顺序

**已有记录可算**：先由当前 video-data 返回的 records/trend 构造展示投影。需要减少客户端计算时，在已有只读 Service 扩展 aggregates 字段，保持旧字段兼容。聚合与scope来自同次读取，避免账号排名与平台环图口径不同。

**真正缺少来源**：小时、留存、设备仍是 FUTURE/EXPERIMENT。后续明确模块任务可以设计同一分析查询扩展，例如：

```text
GET /api/video-data?account=&platform=&days=30
→ 现有返回 + 可选 aggregates（契约草案）

后续待设计：GET /api/analytics/insights?account=&start=&end=&sections=hourly,cohort,devices
→ { availability, metricDefinitions, sourceCapabilities, sections }
```

第二个接口尚不存在，本轮不新增。若平台没有设备/用户事件权限，返回 UNSUPPORTED_SOURCE；展示灰化图形与原因。可导入的平台统计文件也必须定义来源、去重、幂等和单位，不能只为补齐图片编造事件。创作者账号不等于产品登录账号，不将网站访客统计混入视频受众统计。

## 5. 汇总与边界规则

- 今日卡片使用业务时区；周期图表使用选择窗口，二者在标题/脚注明确区分。
- 月聚合仅汇总窗口中已有月份，不虚构12个月。日视图不制造小时点；显示最近至多12个日度点。
- 净增粉丝保留负数；比率必须声明分母；基期为零或缺失时不显示虚假涨幅。
- 曝光缺失不补零。部分覆盖可以展示已记录播放合计，但必须给出覆盖数；未知总量不能称全量表现。
- 来源相同的账号排名、平台构成与周期合计必须一致；互动堆叠四项必须等于其total。
- 空数据、未配置、无来源、不完整、权限不足占用原面板位置，不重排布局。
- 只读角色的聚合范围与下载范围仍由服务器保证。补充预览不是权限实现。

## 6. 当前预览验收边界

默认“补充方案”显示完整图形结构；切换“现有能力”展示3个待接入面板，卡片坐标保持不变。周期/账号筛选在同一日度样例记录上重新聚合，今日值不被周期系数放大。暴露真实来源不足并保持原设计，是当前适配方案的目标；不承诺外部平台一定提供设备或留存数据。
