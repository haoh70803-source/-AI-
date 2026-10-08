import type { Metadata } from "next";
import "./globals.css";
import "@/components/product-v3.css";
import "./black-titanium.css";
import "./apple-workbench.css";

export const metadata: Metadata = {
  title: "鑫世界工作台 1.2",
  description: "面向内容团队的 AI 原生创作工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body data-theme="black-titanium">{children}</body>
    </html>
  );
}
