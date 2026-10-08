import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-semibold whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-[var(--accent)] text-white shadow-[var(--shadow-button)] hover:bg-[var(--accent-strong)]",
        secondary: "border border-[var(--border-strong)] bg-[var(--surface-glass)] text-[var(--text-primary)] shadow-[var(--shadow-xs)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]",
        ghost: "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ asChild, className, variant, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant }), className)} {...props} />;
}
