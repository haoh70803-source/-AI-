import type { HTMLAttributes, ReactNode } from "react";
import { Card } from "./card";
import { cn } from "./utils";

export function ConsoleCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <Card className={cn("console-card min-w-0 p-5 text-[14px] leading-[1.5] text-[var(--text)]", className)} {...props} />;
}

export type ConsoleCardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  icon?: ReactNode;
};

export function ConsoleCardTitle({ className, icon, children, ...props }: ConsoleCardTitleProps) {
  return (
    <h2 className={cn("console-card-title flex items-center gap-2 text-[16px] font-semibold leading-[1.3] text-[var(--text)]", className)} {...props}>
      <span aria-hidden="true" className="h-4 w-[3px] shrink-0 bg-[var(--accent)]" />
      {icon ? <span aria-hidden="true" className="inline-flex shrink-0 text-[var(--accent)]">{icon}</span> : null}
      {children}
    </h2>
  );
}
