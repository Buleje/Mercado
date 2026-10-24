/**
 * loth-filtro-permiso.ts — de qué permiso son las líneas del Libro TH (02-10-2026).
 *
 * Antes `GET /api/admin/forestal/loth?planId=…` ignoraba el `planId` y devolvía
 * las líneas de TODO el negocio: un agente anuló 5 líneas de «PO 12» creyendo
 * que filtraba otro plan. Y el impreso y el Excel —lo que se presenta ante la
 * ARFFS— salían siempre con todos los permisos mezclados. Ahora el filtro es
 * UNO, con el mismo contrato en la tabla, los contadores, el Excel y el impreso.
 *
 * Contrato de la query (`planId` + `solo`), el mismo que `?balance=<id>&solo=1`:
 *   · sin `planId`              → el libro entero.
 *   · `planId=<id>&solo=1`      → sólo las líneas de ESE plan (lo que usa la pantalla).
 *   · `planId=<id>`             → ese plan y las líneas sin plan: el alcance del
 *                                 balance del plan (ADR-459), el que ya usaba el
 *                                 informe de ejecución con `?stats=1&planId=`.
 *   · `planId=sin-plan`         → sólo las líneas que no citan plan.
 *
 * PURO e isomorfo: lo usan la ruta (Zod), la DB class, el Excel, el impreso y la pantalla.
 */

import { z } from "zod";
import { esPlanDePlantacion } from "./loth-poa";
import { nombreDelPlan, permisoInicial, type PlanTablero } from "./loth-tablero-permiso";
import { PLAN_SIN_PLAN } from "./loth-tablero-trozas";
import { metaDe } from "./loth-tipos-plan";

/** El valor de la opción «Sin plan»: el MISMO que usa el Control del permiso. */
export const PERMISO_SIN_PLAN = PLAN_SIN_PLAN;

export type FiltroPermiso =
  | {
      tipo: "plan";
      planId: string;
      /** También las líneas sin plan (alcance del balance). La pantalla manda `false`. */
      conSinPlan: boolean;
    }
  | { tipo: "sin-plan" };

const queryPermiso = z.object({
  planId: z
    .string()
    .max(64, "El permiso no es válido.")
    .regex(/^[A-Za-z0-9_-]+$/, "El permiso no es válido.")
    .optional(),
  solo: z.enum(["0", "1"], { message: "«solo» va como 1 o 0." }).optional(),
});

export type LecturaPermiso = { ok: true; filtro: FiltroPermiso | null } | { ok: false; mensaje: string };

/** Lee `planId`/`solo` de la query. Un `planId` vacío es «sin filtro», no un error. */
export function leerFiltroPermiso(sp: URLSearchParams): LecturaPermiso {
  const crudo = sp.get("planId")?.trim();
  const parsed = queryPermiso.safeParse({
    planId: crudo ? crudo : undefined,
    solo: sp.get("solo")?.trim() || undefined,
  });
  if (!parsed.success) return { ok: false, mensaje: parsed.error.issues[0]?.message ?? "Filtro de permiso inválido." };
  const { planId, solo } = parsed.data;
  if (!planId) return { ok: true, filtro: null };
  if (planId === PERMISO_SIN_PLAN) return { ok: true, filtro: { tipo: "sin-plan" } };
  return { ok: true, filtro: { tipo: "plan", planId, conSinPlan: solo !== "1" } };
}

/**
 * El permiso que vale ahora en el selector. Sin elección guardada (`AUTO`) y
 * con UN solo plan vivo, ése (la regla del Control del permiso); un plan
 * recordado que ya no está en la lista (se dio de baja) vuelve a «Todos» en vez
 * de dejar la tabla vacía. Mientras la lista no llega se confía en lo guardado.
 */
export function permisoElegido(guardado: string | null, planes: readonly { id: string }[] | null): string | null {
  const efectivo = permisoInicial(guardado, planes);
  if (efectivo == null || efectivo === PERMISO_SIN_PLAN) return efectivo;
  return planes == null || planes.some((p) => p.id === efectivo) ? efectivo : null;
}

/** Lo elegido en el selector (`null` = Todos) → el filtro estricto de la pantalla. */
export function filtroDeSeleccion(sel: string | null | undefined): FiltroPermiso | null {
  if (!sel) return null;
  if (sel === PERMISO_SIN_PLAN) return { tipo: "sin-plan" };
  return { tipo: "plan", planId: sel, conSinPlan: false };
}

/** La query que pide ese filtro (sin `?` ni `&` delante). `""` = el libro entero. */
export function queryDelPermiso(f: FiltroPermiso | null): string {
  if (!f) return "";
  if (f.tipo === "sin-plan") return `planId=${PERMISO_SIN_PLAN}`;
  return `planId=${encodeURIComponent(f.planId)}${f.conSinPlan ? "" : "&solo=1"}`;
}

/** ¿Una línea con este `planId` entra en el filtro? Mismo criterio que el `where` del servidor. */
export function cumplePermiso(planId: string | null | undefined, f: FiltroPermiso | null): boolean {
  if (!f) return true;
  const p = planId ?? null;
  if (f.tipo === "sin-plan") return p == null;
  return p === f.planId || (f.conSinPlan && p == null);
}

/** Lo que el encabezado necesita del plan (la fila de la API o la de Prisma sirven). */
export type PlanParaEncabezado = Pick<
  PlanTablero,
  "planType" | "planNumber" | "alias" | "titularName" | "tituloHabilitante" | "resolucionNumber"
>;

export interface EncabezadoPermiso {
  /** «Permiso PO 12», «Líneas sin permiso», «Todos los permisos». */
  titulo: string;
  /** Pares rótulo → valor, en el orden en que se imprimen. Sin valores vacíos. */
  filas: [string, string][];
  /** Para el nombre del archivo: «PO-12», «sin-plan»; `null` = el libro entero. */
  sufijoArchivo: string | null;
  /** Sin filtro: el título de cada sección no se repite con «Todos los permisos». */
  delLibroEntero: boolean;
}

/**
 * Lo que el impreso y el Excel dicen arriba sobre el permiso. Con «Todos»
 * también lo dicen: un libro con tres planes vivos (Blas) no puede parecer
 * el de uno solo.
 */
export function encabezadoDelPermiso(f: FiltroPermiso | null, plan?: PlanParaEncabezado | null): EncabezadoPermiso {
  if (!f) {
    return {
      titulo: "Todos los permisos",
      filas: [["Permiso", "Todos los permisos del libro"]],
      sufijoArchivo: null,
      delLibroEntero: true,
    };
  }
  if (f.tipo === "sin-plan") {
    return {
      titulo: "Líneas sin permiso",
      filas: [["Permiso", "Sin plan — líneas que no citan un plan de manejo"]],
      sufijoArchivo: "sin-plan",
      delLibroEntero: false,
    };
  }
  const nombre = plan ? nombreDelPlan(plan) : f.planId;
  const tipo = plan ? (esPlanDePlantacion(plan) ? metaDe("PLANTACION").sigla : metaDe(plan.planType).sigla) : null;
  const filas: [string, string][] = [["Permiso", tipo ? `${nombre} (${tipo})` : nombre]];
  if (plan?.titularName) filas.push(["Titular del permiso", plan.titularName]);
  if (plan?.tituloHabilitante) filas.push(["Título habilitante", plan.tituloHabilitante]);
  if (plan?.resolucionNumber) filas.push(["Resolución", plan.resolucionNumber]);
  if (f.conSinPlan) filas.push(["Incluye", "también las líneas sin plan"]);
  return { titulo: `Permiso ${nombre}`, filas, sufijoArchivo: slugArchivo(nombre), delLibroEntero: false };
}

/** «19-SEC/REG-PLT-2025-096» → «19-SEC-REG-PLT-2025-096»: sólo ASCII seguro para un nombre de archivo. */
function slugArchivo(s: string): string {
  const limpio = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return limpio || "permiso";
}

/** `libro-loth-PO-12-2026-10-02.xlsx`; sin filtro, el nombre de siempre. */
export function nombreArchivoLibro(enc: Pick<EncabezadoPermiso, "sufijoArchivo">, fechaISO: string, ext: string): string {
  const dia = fechaISO.slice(0, 10);
  return enc.sufijoArchivo ? `libro-loth-${enc.sufijoArchivo}-${dia}.${ext}` : `libro-loth-${dia}.${ext}`;
}
