import type { DbDocumentFolder } from "@/lib/types/documents";

/**
 * Árbol de carpetas (subcarpetas anidadas) — helpers puros.
 *
 * La API (`/api/admin/documents/folders`) devuelve las carpetas **planas** con
 * `parentId`; el árbol se arma en cliente. Compartido por `DocumentosModule`
 * (sidebar) y `MoveToFolderModal` (picker) para no duplicar la lógica.
 */

export type FolderRow = { folder: DbDocumentFolder; depth: number; hasChildren: boolean };

/** Agrupa carpetas por parentId (clave null = raíces), cada grupo ordenado A–Z. */
export function buildChildrenMap(folders: DbDocumentFolder[]): Map<string | null, DbDocumentFolder[]> {
  const map = new Map<string | null, DbDocumentFolder[]>();
  for (const f of folders) {
    const key = f.parentId ?? null;
    const arr = map.get(key);
    if (arr) arr.push(f);
    else map.set(key, [f]);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  }
  return map;
}

/** DFS que respeta el set de carpetas expandidas → filas visibles ordenadas. */
export function flattenVisible(
  childrenMap: Map<string | null, DbDocumentFolder[]>,
  expanded: Set<string>
): FolderRow[] {
  const rows: FolderRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childrenMap.get(parentId) ?? []) {
      const hasChildren = (childrenMap.get(folder.id)?.length ?? 0) > 0;
      rows.push({ folder, depth, hasChildren });
      if (hasChildren && expanded.has(folder.id)) walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** DFS completo (ignora expandido) — para el `<select>`/picker de "Mover a…". */
export function flattenAll(childrenMap: Map<string | null, DbDocumentFolder[]>): FolderRow[] {
  const rows: FolderRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childrenMap.get(parentId) ?? []) {
      rows.push({ folder, depth, hasChildren: (childrenMap.get(folder.id)?.length ?? 0) > 0 });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Ruta raíz→carpeta para los breadcrumbs (guard contra loops por datos corruptos). */
export function folderPath(byId: Map<string, DbDocumentFolder>, id: string | null): DbDocumentFolder[] {
  const path: DbDocumentFolder[] = [];
  const guard = new Set<string>();
  let cur = id ? byId.get(id) : undefined;
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** Todos los descendientes de una carpeta (para borrado en cascada y guard de reparent). */
export function descendantIds(childrenMap: Map<string | null, DbDocumentFolder[]>, id: string): Set<string> {
  const out = new Set<string>();
  const walk = (pid: string) => {
    for (const f of childrenMap.get(pid) ?? []) {
      out.add(f.id);
      walk(f.id);
    }
  };
  walk(id);
  return out;
}
