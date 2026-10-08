export type ArtifactSummaryView = {
  artifactId: string;
  type: "TEXT";
  title: string;
  version: number;
  excerpt: string;
  updatedAt: string;
};

export type ArtifactView = ArtifactSummaryView & {
  content: string;
};
