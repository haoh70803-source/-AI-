import { db } from "@content-center/db";

export async function getDashboardCounts(workspaceId: string) {
  const [materials, projects, pendingReview, pendingPublish] = await Promise.all([
    db.sourceItem.count({ where: { workspaceId, status: { not: "ARCHIVED" } } }),
    db.contentProject.count({ where: { workspaceId, status: { not: "ARCHIVED" } } }),
    db.platformVariant.count({ where: { workspaceId, status: "IN_REVIEW" } }),
    db.publishTask.count({ where: { workspaceId, status: { in: ["READY_TO_PUBLISH", "SCHEDULED"] } } }),
  ]);
  return { materials, projects, pendingReview, pendingPublish };
}

export async function getDashboardWork(workspaceId: string) {
  const projects = await db.contentProject.findMany({ where: { workspaceId, status: { notIn: ["ARCHIVED", "APPROVED"] } }, orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, title: true, updatedAt: true } });
  return { projects };
}
