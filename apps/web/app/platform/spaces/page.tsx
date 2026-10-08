import { db } from "@content-center/db";
import { requireSystemAdmin } from "@/server/access";
import { accountDeliveryStatus } from "@/server/account-delivery";
import { CustomerSpaces } from "@/components/admin/customer-spaces";
export default async function CustomerSpacesPage() {
  await requireSystemAdmin();
  const rows = await db.workspace.findMany({ select: { id: true, name: true, disabledAt: true, _count: { select: { members: { where: { disabledAt: null, user: { disabledAt: null } } } } } }, orderBy: { createdAt: "desc" } });
  return <CustomerSpaces delivery={accountDeliveryStatus()} spaces={rows.map(row => ({ id: row.id, name: row.name, disabled: !!row.disabledAt, activeMembers: row._count.members }))} />;
}
