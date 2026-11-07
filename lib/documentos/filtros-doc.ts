import { familiaDe, type FamiliaArchivo } from "@/lib/documents/tipos-archivo";

/**
 * Los filtros del drive, como datos puros (ADR-119).
 *
 * Antes lo único que se podía acotar era el estado y "sin describir": para
 * encontrar las planillas de julio que pesan más de 10 MB había que mirar a
 * ojo. Acá viven las cuatro preguntas que uno se hace de verdad —qué tipo de
 * archivo es, cuánto pesa, cuándo entró y cuándo vence— separadas de la
 * pantalla para poder probarlas sin abrir un navegador.
 */

export type FiltroPeso = "cualquiera" | "chico" | "mediano" | "grande";
export type FiltroFecha = "cualquiera" | "hoy" | "semana" | "mes" | "anio";
export type FiltroVencimiento = "cualquiera" | "vencidos" | "por-vencer" | "sin-fecha" | "con-fecha";

export interface FiltrosDoc {
  /** Vacío = todos los tipos. */
  familias: FamiliaArchivo[];
  peso: FiltroPeso;
  subido: FiltroFecha;
  vencimiento: FiltroVencimiento;
  /** Vacío = cualquier etiqueta. Igual que `familias`: basta con UNA de las elegidas (OR). */
  tags: string[];
}

export const FILTROS_VACIOS: FiltrosDoc = {
  familias: [],
  peso: "cualquiera",
  subido: "cualquiera",
  vencimiento: "cualquiera",
  tags: [],
};

/** Lo mínimo que hace falta saber de un documento para filtrarlo. */
export interface DocFiltrable {
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  expiresAt: string | null;
  tags: string[];
}

const MB = 1024 * 1024;

/** Los cortes de peso están donde duelen: lo que entra por WhatsApp, lo que tarda en abrir. */
function cumplePeso(size: number, filtro: FiltroPeso): boolean {
  switch (filtro) {
    case "chico": return size < MB;
    case "mediano": return size >= MB && size <= 10 * MB;
    case "grande": return size > 10 * MB;
    default: return true;
  }
}

/**
 * Cuántos días atrás llega el filtro. Se cuenta desde el arranque del día
 * LOCAL y no restando 24 horas: "hoy" tiene que incluir lo que subiste a las
 * 8 de la mañana, no las últimas 24 horas corridas.
 */
function desdeCuando(filtro: FiltroFecha, ahora: Date): Date | null {
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  switch (filtro) {
    case "hoy": return inicio;
    case "semana": return new Date(inicio.getTime() - 6 * 86_400_000);
    case "mes": return new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    case "anio": return new Date(ahora.getFullYear(), 0, 1);
    default: return null;
  }
}

function cumpleVencimiento(expiresAt: string | null, filtro: FiltroVencimiento, ahora: Date): boolean {
  if (filtro === "cualquiera") return true;
  if (filtro === "sin-fecha") return !expiresAt;
  if (!expiresAt) return false;
  if (filtro === "con-fecha") return true;

  const vence = new Date(expiresAt);
  if (Number.isNaN(vence.getTime())) return false;
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  vence.setHours(0, 0, 0, 0);
  const dias = Math.ceil((vence.getTime() - hoy.getTime()) / 86_400_000);

  if (filtro === "vencidos") return dias < 0;
  // "Por vencer" no incluye lo ya vencido: para eso está el filtro de al lado,
  // y mezclarlos hace que el número de la pantalla no cuadre con lo que se ve.
  return dias >= 0 && dias <= 30;
}

export function cumpleFiltros(doc: DocFiltrable, filtros: FiltrosDoc, ahora: Date = new Date()): boolean {
  if (filtros.familias.length > 0 && !filtros.familias.includes(familiaDe(doc.name, doc.mimeType))) {
    return false;
  }
  if (filtros.tags.length > 0 && !filtros.tags.some((t) => doc.tags.includes(t))) return false;
  if (!cumplePeso(doc.size, filtros.peso)) return false;

  const desde = desdeCuando(filtros.subido, ahora);
  if (desde) {
    const subido = new Date(doc.uploadedAt);
    if (Number.isNaN(subido.getTime()) || subido < desde) return false;
  }

  return cumpleVencimiento(doc.expiresAt, filtros.vencimiento, ahora);
}

/** Cuántas cosas están acotando la lista, para poder decirlo en el botón. */
export function cuantosFiltrosActivos(f: FiltrosDoc): number {
  return (
    (f.familias.length > 0 ? 1 : 0) +
    (f.tags.length > 0 ? 1 : 0) +
    (f.peso !== "cualquiera" ? 1 : 0) +
    (f.subido !== "cualquiera" ? 1 : 0) +
    (f.vencimiento !== "cualquiera" ? 1 : 0)
  );
}

/**
 * Qué tipos de archivo hay REALMENTE en lo que se está mirando, con su cuenta.
 * Ofrecer "Video" en un drive sin un solo video es una promesa vacía: cada
 * opción que no filtra nada es una que hay que descartar a mano.
 */
export function familiasPresentes(docs: DocFiltrable[]): { familia: FamiliaArchivo; cuantos: number }[] {
  const cuenta = new Map<FamiliaArchivo, number>();
  for (const d of docs) {
    const f = familiaDe(d.name, d.mimeType);
    cuenta.set(f, (cuenta.get(f) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([familia, cuantos]) => ({ familia, cuantos }))
    .sort((a, b) => b.cuantos - a.cuantos);
}

/**
 * Qué etiquetas hay REALMENTE en lo que se está mirando, con su cuenta —
 * mismo espíritu que `familiasPresentes`. Ordenadas por uso: las etiquetas
 * de un solo documento se pierden entre 40 igual de solitarias si no hay un
 * criterio de qué mostrar primero.
 */
export function tagsPresentes(docs: Pick<DocFiltrable, "tags">[]): { tag: string; cuantos: number }[] {
  const cuenta = new Map<string, number>();
  for (const d of docs) {
    for (const t of d.tags) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([tag, cuantos]) => ({ tag, cuantos }))
    .sort((a, b) => b.cuantos - a.cuantos);
}
