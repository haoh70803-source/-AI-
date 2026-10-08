export type BenchmarkCollectionPreset = "30" | "90" | "180" | "CUSTOM";
export type BenchmarkCollectionRangeInput = { preset?: BenchmarkCollectionPreset; startDate?: string; endDate?: string };

function shanghaiDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function validDateOnly(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) || shanghaiDate(parsed) !== value ? null : parsed;
}

export function resolveBenchmarkCollectionRange(input: BenchmarkCollectionRangeInput, now = new Date()) {
  const preset = input.preset ?? "90";
  if (preset !== "30" && preset !== "90" && preset !== "180" && preset !== "CUSTOM") throw new Error("时间范围选项无效。");
  const today = shanghaiDate(now);
  let startDate: string;
  let endDate: string;
  if (preset === "CUSTOM") {
    startDate = input.startDate ?? "";
    endDate = input.endDate ?? "";
  } else {
    endDate = today;
    const end = validDateOnly(endDate)!;
    const start = new Date(end.getTime() - (Number(preset) - 1) * 24 * 60 * 60 * 1000);
    startDate = shanghaiDate(start);
  }
  const start = validDateOnly(startDate);
  const endStart = validDateOnly(endDate);
  if (!start || !endStart) throw new Error("请填写有效的开始和结束日期。");
  const todayStart = validDateOnly(today)!;
  if (endStart > todayStart) throw new Error("结束日期不能晚于今天。");
  if (start > endStart) throw new Error("开始日期不能晚于结束日期。");
  const days = Math.floor((endStart.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days > 365) throw new Error("单次自定义范围最多 365 天。");
  return { preset, startDate, endDate, rangeStart: start, rangeEnd: new Date(endStart.getTime() + 24 * 60 * 60 * 1000 - 1), days };
}

export function isPublishedInBenchmarkRange(publishedAt: Date | null, rangeStart: Date, rangeEnd: Date) {
  return publishedAt !== null && publishedAt.getTime() >= rangeStart.getTime() && publishedAt.getTime() <= rangeEnd.getTime();
}
