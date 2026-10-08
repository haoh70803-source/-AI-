import { requireSystemAdmin } from "@/server/access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSystemAdmin();
  return <div className="w-full max-w-[95rem]">{children}</div>;
}
