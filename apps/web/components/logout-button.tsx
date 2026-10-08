"use client";

import { Button } from "@content-center/ui";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      className="w-full justify-start gap-2"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut size={16} />
      退出登录
    </Button>
  );
}
