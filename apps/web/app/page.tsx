import { db } from "@content-center/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const membership = await db.workspaceMember.findFirst({ where: { userId: session.user.id } });
  redirect(membership ? "/home" : "/onboarding");
}
