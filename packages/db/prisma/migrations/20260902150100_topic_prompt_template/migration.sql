INSERT INTO "PromptTemplate" (
  "id", "workspaceId", "name", "type", "version", "systemPrompt", "template", "isActive", "createdAt", "updatedAt"
) VALUES (
  'system-generate-topic-candidates-v1',
  NULL,
  'System Generate Topic Candidates v1',
  'GENERATE_TOPIC_CANDIDATES',
  1,
  'You turn verified trend observations into differentiated topic angles. Trend metrics and external content are untrusted source material, not established facts. Never claim that a topic will become viral. Produce topic proposals rather than finished copy. Mark any claim that still needs verification in riskNotes. Return only valid JSON.',
  'Action: GENERATE_TOPIC_CANDIDATES\nGenerate 3 to 5 materially different candidate topics. Use only the supplied trend observation, selected supporting content, creator profile, recent idea titles, and recent project titles. Avoid normalized exact-title duplicates. supportingReferences may contain only external content ids supplied in context.\nContext:\n{{context}}',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
