import "server-only";

import type { ArtifactSummaryView, ArtifactView } from "../../lib/contracts/artifacts";
export type { ArtifactSummaryView, ArtifactView } from "../../lib/contracts/artifacts";




type ArtifactViewRow = {
  id: string;
  type: "TEXT";
  title: string;
  updatedAt: Date;
  draftBranch: { version: number; workingBody: string };
};

function excerpt(value: string) {
  const compact = value.replace(/\s+/gu, " ").trim();
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}…`;
}

export function artifactSummaryView(row: ArtifactViewRow): ArtifactSummaryView {
  return { artifactId: row.id, type: row.type, title: row.title, version: row.draftBranch.version, excerpt: excerpt(row.draftBranch.workingBody), updatedAt: row.updatedAt.toISOString() };
}

export function artifactView(row: ArtifactViewRow): ArtifactView {
  return { ...artifactSummaryView(row), content: row.draftBranch.workingBody };
}
