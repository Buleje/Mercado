import type { DbDocument } from "@/lib/types/documents";

/**
 * Carpetas inteligentes = filtros guardados por el usuario (por dispositivo,
 * localStorage). No mueven archivos: son vistas dinámicas que agrupan los docs
 * que cumplen unas reglas (ej. "facturas > S/1000 sin vencer"). Todo se evalúa
 * en cliente sobre la data que ya viene en el listado.
 */
export interface SmartFolderRules {
  category?: string; // categoría del doc
  tag?: string; // matchea en tags o aiTags (contains)
  status?: string; // workflow
  favorite?: boolean;
  isComprobante?: boolean; // tiene ocrMetadata.structured de factura/boleta/recibo
  expiringDays?: number; // vence en ≤ N días (incluye vencidos)
  minTotal?: number; // total del comprobante ≥ este monto
}

export interface SmartFolder {
  id: string;
  name: string;
  rules: SmartFolderRules;
}

const KEY = "doc-smart-folders";

export function loadSmartFolders(): SmartFolder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveSmartFolders(folders: SmartFolder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(folders));
  } catch {
    /* localStorage no disponible */
  }
}

function structuredTotal(doc: DbDocument): number | null {
  const s = doc.ocrMetadata?.structured as { docType?: string; total?: number | string } | undefined;
  if (!s || !/factura|boleta|recibo|guia|nota/i.test(s.docType ?? "")) return null;
  const v = s.total;
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : null;
}

export function matchesSmartFolder(doc: DbDocument, r: SmartFolderRules): boolean {
  if (r.category && doc.category !== r.category) return false;
  if (r.status && doc.status !== r.status) return false;
  if (r.favorite && !doc.favorite) return false;
  if (r.tag) {
    const t = r.tag.toLowerCase();
    const hit = [...doc.tags, ...doc.aiTags].some((x) => x.toLowerCase().includes(t));
    if (!hit) return false;
  }
  const total = structuredTotal(doc);
  if (r.isComprobante && total === null) return false;
  if (r.minTotal !== undefined && (total === null || total < r.minTotal)) return false;
  if (r.expiringDays !== undefined) {
    if (!doc.expiresAt) return false;
    const days = Math.ceil((new Date(doc.expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days > r.expiringDays) return false;
  }
  return true;
}

/** Describe las reglas en texto legible para la UI. */
export function describeRules(r: SmartFolderRules): string {
  const parts: string[] = [];
  if (r.category) parts.push(r.category);
  if (r.isComprobante) parts.push("comprobantes");
  if (r.minTotal !== undefined) parts.push(`≥ S/${r.minTotal}`);
  if (r.tag) parts.push(`#${r.tag}`);
  if (r.status) parts.push(`estado: ${r.status}`);
  if (r.favorite) parts.push("favoritos");
  if (r.expiringDays !== undefined) parts.push(`vence ≤${r.expiringDays}d`);
  return parts.length ? parts.join(" · ") : "todos";
}
