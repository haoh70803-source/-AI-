export type CanvasLayoutInput = {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex?: number;
};

export type CanvasMaterialReferenceDTO = {
  id: string;
  purpose: "PRIMARY" | "CONTEXT";
  excerpt: string | null;
  sourceTitleSnapshot: string;
  sourceTypeSnapshot: string;
  sourceUpdatedAtAtAttach: string | null;
  sourceItem: {
    id: string;
    title: string | null;
    description: string | null;
    sourceType: string;
    sourcePlatform: string;
    status: string;
    thumbnailUrl: string | null;
    updatedAt: string;
  };
  sourceAsset: { id: string; assetType: string; status: string; mimeType: string | null } | null;
};

export type CanvasObjectDTO = {
  id: string;
  objectType: "TEXT" | "MATERIAL_REFERENCE" | "IMAGE_REFERENCE";
  title: string | null;
  textContent: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  contentVersion: number;
  layoutVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  materialReference: CanvasMaterialReferenceDTO | null;
  generatedFrom: Array<{ sourceObjectId: string; sourceTitle: string; sourceDeleted: boolean; sourceSnapshotId: string }>;
};
