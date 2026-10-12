import type { ComponentProps } from "react";
import "./themed-select.css";
export function ThemedSelect({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`themed-select ${className}`} />;
}
