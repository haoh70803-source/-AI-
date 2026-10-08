import { isExperienceAccount } from "@/server/experience-account";
import { requireWorkspace } from "@/server/access";
import { SettingsWindow } from "@/components/settings-window";
export default async function ModalLayout({children}:{children:React.ReactNode}) { const {workspace,session}=await requireWorkspace(); return <SettingsWindow name={workspace.name} intercepted>{isExperienceAccount(session.user) ? <><p className="settings-footnote">体验账号：设置仅供查看。</p><fieldset disabled className="min-w-0">{children}</fieldset></> : children}</SettingsWindow>; }
