/**
 * Claves válidas de `DocumentFolder.icon` puestas desde el selector (las mismas
 * que `FOLDER_ICON_OPTIONS` de `components/admin/documentos/folder-visuals.tsx`;
 * un test las mantiene iguales). Vive acá, sin React, para que la ruta bulk
 * valide sin importar Lucide.
 */
export const FOLDER_ICON_KEYS = [
  "folder", "contract", "legal", "receipt", "building",
  "tool", "shield", "bank", "box", "photo",
] as const;

export type FolderIconKey = (typeof FOLDER_ICON_KEYS)[number];
