"use client";

import { Button, Input } from "@content-center/ui";
import { useActionState } from "react";
import { createWorkspaceAction, type OnboardingState } from "@/app/onboarding/actions";

const initialState: OnboardingState = { error: "" };

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, initialState);
  return (
    <form action={action} className="mt-7 space-y-4">
      <label className="block space-y-2 text-sm font-medium">
        <span>Workspace 名称</span>
        <Input name="name" minLength={2} maxLength={80} placeholder="例如：我的内容团队" required autoFocus />
      </label>
      {state.error ? <p role="alert" className="text-sm text-[var(--danger)]">{state.error}</p> : null}
      <Button disabled={pending} className="w-full">
        {pending ? "创建中…" : "创建 Workspace"}
      </Button>
    </form>
  );
}
