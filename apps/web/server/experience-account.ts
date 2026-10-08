export function isExperienceAccount(user: {email?: string | null}) { return user.email?.toLowerCase() === "xsj666@experience.invalid"; }

/** Research account creation is distinct from company settings administration. */
export function canAddResearchAccount(role: string, user: {email?: string | null}) {
  return role === "OWNER" || role === "ADMIN" || (role === "EDITOR" && isExperienceAccount(user));
}
