import type { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex min-h-6 items-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]", className)}
      {...props}
    />
  );
}
