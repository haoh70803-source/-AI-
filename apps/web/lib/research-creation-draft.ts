import type { ReferenceOption, ResearchCreationDraft } from "./contracts/references";
type Scope = { workspaceId: string; userId: string; projectId: string };
export type ProjectInputDraft = { input: string; references: ReferenceOption[]; materialIds: string[]; skillId: string; modelId: string };
const prefix = "research-creation:";
const ttl = 30 * 60 * 1000;
const key = (scope: Scope, kind: string) => prefix + scope.workspaceId + ":" + scope.userId + ":" + scope.projectId + ":" + kind;
function load(scope: Scope, kind: string): unknown {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(scope, kind)) || "null");
    if (!value || value.actor?.workspaceId !== scope.workspaceId || value.actor?.userId !== scope.userId || value.projectId !== scope.projectId || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || value.expiresAt > Date.now()+ttl+5000) { sessionStorage.removeItem(key(scope, kind)); return null; }
    return value;
  } catch { return null; }
}
export function cleanResearchDrafts(actor?: { workspaceId: string; userId: string }) {
  try { for (const name of Object.keys(sessionStorage).filter(name => name.startsWith(prefix))) {
    try { const value = JSON.parse(sessionStorage.getItem(name) || "null"); if (!actor || !value || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || value.actor?.userId !== actor.userId || value.actor?.workspaceId !== actor.workspaceId) sessionStorage.removeItem(name); }
    catch { sessionStorage.removeItem(name); }
  } } catch { /* No storage access; callers retain their in-memory input. */ }
}
export function writeResearchHandoff(value: ResearchCreationDraft) {
  try { cleanResearchDrafts(value.actor); sessionStorage.setItem(key({ ...value.actor, projectId: value.projectId }, "pending"), JSON.stringify(value)); return true; } catch { return false; }
}
export function readResearchHandoff(scope: Scope): ResearchCreationDraft | null {
  const value = load(scope, "pending") as ResearchCreationDraft | null;
  return value && typeof value.id === "string" && typeof value.content === "string" && value.content.length <= 4000 && value.reference?.sourceType === "RESEARCH" && value.reference.researchSelection ? value : null;
}
export function clearResearchHandoff(scope: Scope) { try { sessionStorage.removeItem(key(scope, "pending")); } catch { /* In-memory choice remains usable. */ } }
export function readProjectInput(scope: Scope): ProjectInputDraft | null {
  const value = load(scope, "composer") as { draft?: ProjectInputDraft } | null, draft = value?.draft;
  return draft && typeof draft.input === "string" && draft.input.length <= 4000 && Array.isArray(draft.references) && draft.references.length <= 8 && Array.isArray(draft.materialIds) && draft.materialIds.length <= 8 && typeof draft.skillId === "string" && typeof draft.modelId === "string" ? draft : null;
}
export function writeProjectInput(scope: Scope, draft: ProjectInputDraft) {
  try { if (!draft.input.trim() && !draft.references.length && !draft.materialIds.length && !draft.skillId && !draft.modelId) sessionStorage.removeItem(key(scope, "composer"));
    else sessionStorage.setItem(key(scope, "composer"), JSON.stringify({ actor: { workspaceId: scope.workspaceId, userId: scope.userId }, projectId: scope.projectId, expiresAt: Date.now() + ttl, draft })); return true;
  } catch { return false; }
}

type ResearchChoiceDraft = { version: number; items: Array<{ id:string; text:string }>; content:string; projectId:string };
const choiceKey=(actor:{workspaceId:string;userId:string},kind:string,resultId:string)=>prefix+actor.workspaceId+":"+actor.userId+":result:"+kind+":"+resultId;
export function readResearchChoice(actor:{workspaceId:string;userId:string},kind:string,resultId:string,version:number):ResearchChoiceDraft|null {
 try { const name=choiceKey(actor,kind,resultId), value=JSON.parse(sessionStorage.getItem(name)||"null");
   if(!value||value.actor?.userId!==actor.userId||value.actor?.workspaceId!==actor.workspaceId||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+ttl+5000||value.draft?.version!==version){sessionStorage.removeItem(name);return null;}
   const d=value.draft;
   return Array.isArray(d.items)&&d.items.length<=30&&d.items.every((item:{id?:unknown;text?:unknown})=>typeof item.id==="string"&&typeof item.text==="string")&&typeof d.content==="string"&&d.content.length<=4000&&typeof d.projectId==="string"?d:null;
 }catch{return null;}
}
export function writeResearchChoice(actor:{workspaceId:string;userId:string},kind:string,resultId:string,draft:ResearchChoiceDraft){
 try {sessionStorage.setItem(choiceKey(actor,kind,resultId),JSON.stringify({actor,expiresAt:Date.now()+ttl,draft}));return true;}catch{return false;}
}
