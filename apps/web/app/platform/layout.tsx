import Link from "next/link";
import { requireSystemAdmin } from "@/server/access";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requireSystemAdmin();
  return <main className="mx-auto max-w-7xl p-4 sm:p-8"><nav aria-label="平台管理" className="mb-6 flex flex-wrap gap-5"><Link href="/workspace-unavailable">我的账号与空间</Link><Link href="/platform/accounts">平台账号</Link><Link href="/platform/spaces">客户空间</Link></nav>{children}</main>;
}
