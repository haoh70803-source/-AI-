import type { Metadata } from "next";
import { APPEARANCE_BOOTSTRAP } from "@/lib/appearance";
import { AppearanceSync } from "@/components/appearance-settings";
import "./globals.css";
import "@/components/product-v3.css";
import "./black-titanium.css";
import "./apple-workbench.css";

export const metadata: Metadata = {
  title: "鑫世界工作台 1.2",
  description: "面向内容团队的 AI 原生创作工作台",
  icons: { icon: { url: "/brand/xin-world-icon.svg", type: "image/svg+xml" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-theme="black-titanium" suppressHydrationWarning>
      <body data-theme="black-titanium" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} />
        <AppearanceSync />
        {children}
      </body>
    </html>
  );
}
