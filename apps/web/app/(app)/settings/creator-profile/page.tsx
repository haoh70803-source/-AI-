import { Card } from "@content-center/ui";
import { CreatorProfileForm } from "@/components/settings/creator-profile-form";
import { PageHeader } from "@/components/page";
import { requireWorkspace } from "@/server/access";
import { getCreatorProfile } from "@/server/creator-profile-service";
import { listCreatorProfileSuggestions } from "@/server/learning-suggestions/service";
import { CreatorProfileSuggestionPanel } from "@/components/learning-suggestion-panels";

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

export default async function CreatorProfilePage() {
  const { session, workspace, role } = await requireWorkspace();
  const [profile, suggestions] = await Promise.all([getCreatorProfile(workspace.id, session.user.id), listCreatorProfileSuggestions({ workspaceId: workspace.id, userId: session.user.id })]);
  const initial = { displayName: profile?.displayName || session.user.name, positioning: profile?.positioning || "", targetAudience: profile?.targetAudience || "", tone: profile?.tone || "", preferredStyle: profile?.preferredStyle || "", forbiddenStyle: profile?.forbiddenStyle || "", coreTopics: strings(profile?.coreTopics), personalViews: strings(profile?.personalViews), brandTerms: strings(profile?.brandTerms), forbiddenTerms: strings(profile?.forbiddenTerms), hookPreferences: strings(profile?.hookPreferences), structurePreferences: strings(profile?.structurePreferences), ctaPreferences: strings(profile?.ctaPreferences), examplePhrases: strings(profile?.examplePhrases), notes: profile?.notes || "" };
  return <><PageHeader title="创作偏好" description="选择常用表达偏好即可，其他内容可以在对话中慢慢补充。" /><div className="mx-auto grid max-w-3xl gap-5"><details className="settings-preference-detail"><summary>可选：查看从已确认内容形成的偏好建议</summary><CreatorProfileSuggestionPanel initial={suggestions} editable={role !== "VIEWER"} /></details><Card className="p-6"><CreatorProfileForm initial={initial} editable={role !== "VIEWER"} /></Card></div></>;
}
