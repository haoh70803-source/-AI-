import { PageHeader } from "@/components/page";
import { requireWorkspace } from "@/server/access";
import { LocalStorageSettings } from "@/components/local-storage-settings";
export default async function StoragePage() {
  const { role } = await requireWorkspace();
  return <><PageHeader title="本机存储" description="管理当前公司在这台电脑上的文件保存位置。" />{["OWNER", "ADMIN"].includes(role) ? <LocalStorageSettings/> : <p className="settings-footnote">资料由本机存储管理。查看目录或更改保存位置，请联系公司所有者或管理员。</p>}</>;
}
