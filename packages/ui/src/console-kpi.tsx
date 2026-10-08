import type { HTMLAttributes, ReactNode } from "react";
import { ConsoleCard, ConsoleCardTitle } from "./console-card";
import { cn } from "./utils";

export type ConsoleKpiProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: string;
  value: number | null | undefined;
  description?: ReactNode;
  icon?: ReactNode;
};

export function ConsoleKpi({ title, value, description, icon, className, ...props }: ConsoleKpiProps) {
  const hasValue = typeof value === "number" && Number.isFinite(value);
  const useWan = hasValue && Math.abs(value) >= 10_000;
  const display = !hasValue ? "—" : useWan ? (value / 10_000).toFixed(1) : value.toLocaleString("zh-CN");

  return (
    <ConsoleCard className={cn("console-kpi console-kpi-starship", className)} {...props}>
      <ConsoleCardTitle icon={icon}>{title}</ConsoleCardTitle>
      <div className="console-kpi-value my-4 flex flex-wrap items-baseline gap-1 [font-variant-numeric:tabular-nums]">
        <strong className="console-kpi-number text-[48px] font-semibold leading-[1.2]">{display}</strong>
        {useWan ? <span className="console-kpi-unit text-[20px] leading-[1.2] text-[var(--text-secondary)]">万</span> : null}
      </div>
      {description != null ? <div className="console-kpi-description text-[12px] leading-[1.5] text-[var(--text-secondary)]">{description}</div> : null}
    </ConsoleCard>
  );
}
