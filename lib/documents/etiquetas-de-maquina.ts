/**
 * lib/documents/etiquetas-de-maquina.ts — quién puede poner o sacar las
 * etiquetas que el SISTEMA lee para decidir algo.
 *
 * · `gtf:` / `casillero:` meten un papel en el casillero de una guía (ADR-438):
 *   los roles de la ruta de papeles de guía (admin, almacenero, dueño).
 * · `plan:` / `plan-carpeta:` / `campo:` / `papel:` meten un archivo en la
 *   carpeta, el casillero o la lista «Papeles» de un plan de manejo (ADR-467):
 *   sólo admin y dueño, los que escriben en el plan. `papel:resolucion` es lo
 *   que lee «Llenar desde la resolución»: un almacenero que la plantara podía
 *   proponer el volumen autorizado (security 25-10).
 *
 * Lo usan las tres puertas que escriben etiquetas de un documento: el PATCH
 * de uno, el lote («Etiquetar») y renombrar/borrar una etiqueta en todos.
 *
 * PURO: sin Prisma.
 */
import { ROLES_PAPELES_GUIA } from "@/lib/forestal/documentos-guia";
import { ROLES_ESCRITURA_DOCS_PLAN, esTagDeMaquinaPlan } from "@/lib/forestal/plan-documentos-tipos";

const esDeGuia = (t: string): boolean => /^(gtf|casillero):/i.test(t.trim());
/* Sin mayúsculas ni espacios de borde: «Papel:resolucion» también se frena. */
const esDelPlan = (t: string): boolean => esTagDeMaquinaPlan(t.trim().toLowerCase());

const ROLES_GUIA = new Set<string>(ROLES_PAPELES_GUIA);
const ROLES_PLAN = new Set<string>(ROLES_ESCRITURA_DOCS_PLAN);

export const MENSAJE_ETIQUETA_DE_GUIA = "Solo admin, dueño o almacenero cambian a qué guía pertenece un documento.";
export const MENSAJE_ETIQUETA_DEL_PLAN =
  "Solo el dueño o un admin cambian a qué plan, casillero o papel del permiso pertenece un documento.";

/** El motivo del 403 si `role` no puede poner ni sacar `tag`; null = puede. */
export function etiquetaVedada(role: string, tag: string): string | null {
  if (esDelPlan(tag) && !ROLES_PLAN.has(role)) return MENSAJE_ETIQUETA_DEL_PLAN;
  if (esDeGuia(tag) && !ROLES_GUIA.has(role)) return MENSAJE_ETIQUETA_DE_GUIA;
  return null;
}

/**
 * Lo mismo para un cambio de lista (PATCH): sólo cuenta lo que se agrega o se
 * saca. Un rol sin permiso puede editar las etiquetas humanas de un papel que
 * ya tiene las de máquina, mientras las deje como están.
 */
export function cambioDeEtiquetasVedado(
  role: string,
  antes: readonly string[],
  despues: readonly string[],
): string | null {
  const a = new Set(antes.map((t) => t.trim()));
  const d = new Set(despues.map((t) => t.trim()));
  for (const t of [...d].filter((x) => !a.has(x)).concat([...a].filter((x) => !d.has(x)))) {
    const motivo = etiquetaVedada(role, t);
    if (motivo) return motivo;
  }
  return null;
}
