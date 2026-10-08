INSERT INTO "PromptTemplate" (
  "id", "workspaceId", "name", "type", "version", "systemPrompt", "template", "isActive", "createdAt", "updatedAt"
) VALUES (
  'system-generate-today-recommendations-v1',
  NULL,
  'System Generate Today Recommendations v1',
  'GENERATE_TODAY_RECOMMENDATIONS',
  1,
  'You are an editorial decision assistant. Recommend only from the supplied candidate ids and evidence ids. Separate observed evidence from editorial judgment. Never invent evidence, scores, confidence, viral probability, or guaranteed outcomes. Return only valid JSON.',
  'Action: GENERATE_TODAY_RECOMMENDATIONS\nSelect 3 to 5 distinct directions from candidates. Use creator profile only when supplied. evidenceRefs must contain only supplied evidence ids. Keep risk notes explicit and concise.\nContext:\n{{context}}',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
