/**
 * Lo que el semáforo del plan (`loth-plan-semaforo`) necesita del LIBRO y la
 * pantalla no tiene: los despachos sin asentar, los asientos tardíos y quién
 * taló cada árbol. Lo calcula el servidor con las mismas líneas y guías que el
 * aviso de plazos (`ForestLothDB.datosAvisoPlazos` + `loth-aviso-plazos`): la
 * campana, el WhatsApp y el semáforo no pueden contar distinto.
 *
 * Quién taló: por ÁRBOL, no por línea. Un árbol trozado en cuatro son cuatro
 * líneas de trozado y un solo motosierrista; en Blas (24-10) el libro tiene 0
 * talas y 82 trozados — el árbol entra al libro por el trozado. Un árbol
 * «dice quién lo taló» si alguna de sus líneas de tala o trozado lo dice.
 *
 * También devuelve los motosierristas ya escritos (el último primero): el
 * formulario de tala y trozado los ofrece y propone el de la última tala. Y,
 * por árbol, quién lo TALÓ (`porArbol`): el trozado propone a ese, no al de la
 * última línea del libro (B4, 25-10). Sin tala de ese árbol, no propone nadie.
 *
 * Y el RUC o DNI del titular de cada plan, que vive en su PERMISO
 * (`ForestContrato.titularDoc`), no en el plan: la ficha del plan lo cuenta y
 * la pantalla del plan no carga los permisos.
 *
 * PURO.
 */
import type { LothEntryDTO } from "./loth-constants";
import { despachosSinAsentar, registrosTardiosRecientes, type DatosAvisoTh } from "./loth-aviso-plazos";
import type { PlazosSemaforo } from "./loth-plan-semaforo";

/** Tope de nombres que se ofrecen: un monte real tiene un puñado de motosierristas. */
const TOPE_USADOS = 30;

export interface TalasDelPlan {
  /** Árboles con tala o trozado en el libro. */
  total: number;
  /** De esos, los que dicen quién los taló. */
  conMotosierrista: number;
}

export interface MotosierristasDelLibro {
  /** El de la línea de tala o trozado más reciente que lo dice. */
  ultimo: string | null;
  /** Los nombres ya escritos, sin repetir, del más reciente al más viejo. */
  usados: string[];
  /** Quién taló cada árbol, por `claveArbolTala(planId, treeCode)`: la tala más reciente que lo dice. */
  porArbol: Record<string, string>;
}

/** La clave de un árbol en `porArbol`: el plan y el código, sin mayúsculas ni espacios de más. */
export function claveArbolTala(planId: string | null | undefined, treeCode: string | null | undefined): string | null {
  const codigo = (treeCode ?? "").trim().toUpperCase();
  return codigo ? `${planId ?? ""}|${codigo}` : null;
}

/** El motosierrista de la TALA de ese árbol, si alguna lo dice. */
export function motosierristaDeLaTala(
  libro: Pick<SemaforoDelLibro, "motosierristas"> | null | undefined,
  planId: string | null | undefined,
  treeCode: string | null | undefined,
): string | null {
  const k = claveArbolTala(planId, treeCode);
  return (k && libro?.motosierristas.porArbol?.[k]) || null;
}

export interface SemaforoDelLibro {
  plazos: PlazosSemaforo;
  /** Por plan (`planId`). Un plan sin talas ni trozados no aparece. */
  talasPorPlan: Record<string, TalasDelPlan>;
  motosierristas: MotosierristasDelLibro;
  /**
   * RUC o DNI del titular, por id del plan Y por id del permiso: el permiso
   * guarda su plan (`planId`) o el plan guarda su permiso (`contratoId`), y la
   * pantalla busca por los dos (`docDelTitularDe`). Sólo permisos vivos.
   */
  docsDelTitular: Record<string, string>;
}

/** Lo que se lee de un permiso para el RUC o DNI de su titular. */
export interface PermisoConDoc {
  id: string;
  planId: string | null;
  titularDoc: string | null;
  isActive: boolean;
}

const conArbol = (l: Pick<LothEntryDTO, "section">) => l.section === "tala" || l.section === "trozado";
const nombre = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ");

/** Más reciente primero: por fecha del hecho, después por cuándo se asentó y el N° de línea. */
function masReciente(a: LothEntryDTO, b: LothEntryDTO): number {
  return (
    (b.entryDate ?? "").localeCompare(a.entryDate ?? "") ||
    (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
    b.lineNo - a.lineNo
  );
}

export function talasPorPlan(lineas: readonly LothEntryDTO[]): Record<string, TalasDelPlan> {
  const arboles = new Map<string, Map<string, boolean>>();
  for (const l of lineas) {
    if (l.status === "anulado" || !conArbol(l) || !l.planId) continue;
    const arbol = (l.treeCode ?? "").trim().toUpperCase() || `línea:${l.section}:${l.lineNo}`;
    const delPlan = arboles.get(l.planId) ?? new Map<string, boolean>();
    delPlan.set(arbol, (delPlan.get(arbol) ?? false) || nombre(l.motosierrista).length > 0);
    arboles.set(l.planId, delPlan);
  }
  const out: Record<string, TalasDelPlan> = {};
  for (const [planId, delPlan] of arboles) {
    out[planId] = { total: delPlan.size, conMotosierrista: [...delPlan.values()].filter(Boolean).length };
  }
  return out;
}

export function motosierristasDelLibro(lineas: readonly LothEntryDTO[]): MotosierristasDelLibro {
  const conNombre = lineas.filter((l) => l.status !== "anulado" && conArbol(l) && nombre(l.motosierrista)).sort(masReciente);
  const usados: string[] = [];
  const vistos = new Set<string>();
  for (const l of conNombre) {
    const n = nombre(l.motosierrista);
    const k = n.toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    usados.push(n);
    if (usados.length >= TOPE_USADOS) break;
  }
  const porArbol: Record<string, string> = {};
  // `conNombre` ya viene del más reciente al más viejo: el primero gana.
  for (const l of conNombre) {
    if (l.section !== "tala") continue;
    const k = claveArbolTala(l.planId, l.treeCode);
    if (k && !(k in porArbol)) porArbol[k] = nombre(l.motosierrista);
  }
  return { ultimo: usados[0] ?? null, usados, porArbol };
}

export function plazosDelLibro(d: DatosAvisoTh, ahora: Date | number): PlazosSemaforo {
  const ds = despachosSinAsentar(d, ahora);
  const vencidos = ds.filter((x) => x.estado === "vencido").length;
  return {
    porVencer: ds.length - vencidos,
    vencidos,
    quedanMin: ds.length > 0 ? Math.min(...ds.map((x) => x.quedan)) : null,
    tardias: registrosTardiosRecientes(d.lineas, ahora).length,
  };
}

export function docsDelTitular(permisos: readonly PermisoConDoc[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of permisos) {
    const doc = (p.titularDoc ?? "").replace(/\s+/g, "");
    if (!p.isActive || !doc) continue;
    out[p.id] = doc;
    if (p.planId) out[p.planId] = doc;
  }
  return out;
}

/** El RUC o DNI del titular de un plan: el de su permiso, si alguno lo tiene. */
export function docDelTitularDe(
  docs: Readonly<Record<string, string>> | null | undefined,
  plan: { id: string; contratoId?: string | null },
): string | null {
  if (!docs) return null;
  return docs[plan.id] ?? (plan.contratoId ? docs[plan.contratoId] : undefined) ?? null;
}

export function semaforoDelLibro(d: DatosAvisoTh, ahora: Date | number, permisos: readonly PermisoConDoc[] = []): SemaforoDelLibro {
  return {
    plazos: plazosDelLibro(d, ahora),
    talasPorPlan: talasPorPlan(d.lineas),
    motosierristas: motosierristasDelLibro(d.lineas),
    docsDelTitular: docsDelTitular(permisos),
  };
}
