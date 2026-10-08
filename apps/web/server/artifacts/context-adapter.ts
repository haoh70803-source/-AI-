import "server-only";

import type { ContextItem } from "../ai/control/contracts";
import { getArtifactContext } from "./service";

export class ArtifactContextAdapter {
  async resolve(input: { workspaceId: string; userId: string; projectId: string; artifactId: string }): Promise<{ artifactId: string; item: ContextItem }> {
    const artifact = await getArtifactContext(input);
    return {
      artifactId: artifact.artifactId,
      item: {
        objectType: "ARTIFACT",
        objectId: artifact.artifactId,
        version: artifact.version,
        ownership: "PENDING",
        provenance: "artifact:text",
        whySelected: "用户明确指定的文本产出",
        truncated: false,
        source: { sourceType: "ARTIFACT", sourceId: artifact.artifactId, title: artifact.title, version: artifact.version, generated: true, href: `/dashboard?project=${input.projectId}&node=artifact:${artifact.artifactId}` },
        content: JSON.stringify({ artifactId: artifact.artifactId, title: artifact.title, content: artifact.content }),
      },
    };
  }
}
