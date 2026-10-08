import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { accountDeliveryStatus } from "@/server/account-delivery";
import { AccountSecurityForm } from "@/components/account-security-form";
export default async function AccountActionPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return <AccountSecurityForm kind="invite" mailAvailable={accountDeliveryStatus().available} signedInEmail={session?.user.email} />;
}
