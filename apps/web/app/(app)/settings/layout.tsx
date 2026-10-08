import { isExperienceAccount } from "@/server/experience-account";
import { SettingsWindow } from "@/components/settings-window";
import { requireWorkspace } from "@/server/access";
import "@/components/settings-v1.css";
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { workspace, session } = await requireWorkspace();
  return <SettingsWindow name={workspace.name}>{isExperienceAccount(session.user) ? <><p className="settings-footnote">体验账号：设置仅供查看。</p><fieldset disabled className="min-w-0">{children}</fieldset></> : children}</SettingsWindow>;
}
