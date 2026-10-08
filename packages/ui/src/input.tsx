import type { InputHTMLAttributes } from "react";
import { cn } from "./utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]", className)}
      {...props}
    />
  );
}
