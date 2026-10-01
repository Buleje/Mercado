/**
 * Tipos, constantes y helpers compartidos del módulo "Mis Documentos" del superadmin.
 * Sin estado ni JSX — los consumen el hook de datos y los sub-componentes.
 */
import type { DbDocument } from "@/lib/types/documents";

export const CAT_LABEL: Record<string, string> = {
  contratos: "Contratos",
  facturas: "Facturas",
  manuales: "Manuales",
  fotos: "Fotos",
  personal: "Personal",
  otros: "Otros",
};

/** Ventana (días) a partir de la cual un documento se considera "por vencer". */
export const EXPIRY_WARN_DAYS = 30;

export type QuickFilter = "todos" | "favoritos" | "porVencer" | "vencidos";
export type SortKey = "recientes" | "nombre" | "tamano" | "vencimiento";
export type ViewMode = "list" | "grid";

export const SORT_LABEL: Record<SortKey, string> = {
  recientes: "Más recientes",
  nombre: "Nombre (A-Z)",
  tamano: "Tamaño (mayor)",
  vencimiento: "Próximos a vencer",
};

export interface DocStats {
  total: number;
  favoritos: number;
  porVencer: number;
  vencidos: number;
  totalSize: number;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Días que faltan para `iso` (negativo = ya venció). `null` si no hay fecha. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

/** `expiresAt` ISO → `yyyy-mm-dd` para `<input type="date">`. */
export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export function computeStats(docs: DbDocument[]): DocStats {
  let favoritos = 0;
  let porVencer = 0;
  let vencidos = 0;
  let totalSize = 0;
  for (const d of docs) {
    if (d.favorite) favoritos++;
    totalSize += d.size;
    const dd = daysUntil(d.expiresAt);
    if (dd !== null) {
      if (dd < 0) vencidos++;
      else if (dd <= EXPIRY_WARN_DAYS) porVencer++;
    }
  }
  return { total: docs.length, favoritos, porVencer, vencidos, totalSize };
}

/** Aplica búsqueda + filtro rápido + categoría + orden. Pura, testeable. */
export function selectDocs(
  docs: DbDocument[],
  opts: { search: string; quick: QuickFilter; category: string; sort: SortKey },
): DbDocument[] {
  const { search, quick, category, sort } = opts;
  let list = docs.filter((d) => {
    if (category !== "todos" && d.category !== category) return false;
    if (quick === "favoritos" && !d.favorite) return false;
    if (quick === "porVencer") {
      const dd = daysUntil(d.expiresAt);
      if (dd === null || dd < 0 || dd > EXPIRY_WARN_DAYS) return false;
    }
    if (quick === "vencidos") {
      const dd = daysUntil(d.expiresAt);
      if (dd === null || dd >= 0) return false;
    }
    return true;
  });

  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (d) => d.name.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  const sorted = [...list];
  switch (sort) {
    case "nombre":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "es"));
      break;
    case "tamano":
      sorted.sort((a, b) => b.size - a.size);
      break;
    case "vencimiento":
      sorted.sort((a, b) => {
        const da = daysUntil(a.expiresAt);
        const db = daysUntil(b.expiresAt);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
      break;
    default:
      sorted.sort((a, b) => (b.uploadedAt > a.uploadedAt ? 1 : -1));
  }
  return sorted;
}
