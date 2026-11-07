/**
 * Aviso antes de que venza el plan de manejo (Brandon 24-10, «Semáforo
 * antimulta»): 90, 30 y 7 días antes, y el mismo día. UNA vez por plan y por
 * escalón.
 *
 * El cron `forestal-plazos` ya avisaba de los planes por vencer, pero TODOS
 * los días: 90 WhatsApp seguidos por el mismo plan enseñan a ignorar el aviso.
 * Desde ahora `forestal-plazos` sólo insiste con el plan YA vencido (eso sí
 * hay que arreglarlo hoy) y este aviso se encarga de los escalones.
 *
 * Reglas:
 *   · Se manda el escalón MÁS URGENTE que toque y no se haya mandado; al
 *     sellarlo se sellan también los más largos. Un plan que se carga con 20
 *     días por delante recibe el de 30, no el de 90 y el de 30 juntos.
 *   · Si cambia la fecha de vencimiento (se renovó), los escalones vuelven a
 *     cero: es otro vencimiento.
 *   · Sin fecha: un aviso «no te puedo avisar», una vez. En una plantación no:
 *     su vigencia es opcional (ADR-459).
 *   · No se avisa de un plan cerrado, suspendido, dado de baja (`isActive`
 *     falso) ni ya vencido (eso lo dice `forestal-plazos` cada día).
 *
 * La cuenta de días es la de la ficha del permiso (`construirFichaPermiso`, el
 * «hoy» de Lima): el aviso y la pantalla no pueden contar distinto.
 *
 * PURO: el cron lee el registro, llama a `planearAvisosVencimiento`, manda y
 * recién si algún canal salió, guarda `sellarAvisos`.
 */
import { construirFichaPermiso, nombreDelPlan, type PlanFichaApi } from "./loth-ficha-permiso";
import { esTipoPlantacion } from "./loth-tipos-plan";

export const UMBRALES_VENCIMIENTO = [90, 30, 7, 0] as const;
export type UmbralVencimiento = (typeof UMBRALES_VENCIMIENTO)[number] | "sin_fecha";

/** Lo ya avisado de un plan, para la fecha de vencimiento que tenía entonces. */
export interface RegistroAvisoPlan {
  /** `AAAA-MM-DD` del vencimiento al que se refieren los envíos; `null` = sin fecha. */
  hasta: string | null;
  enviados: UmbralVencimiento[];
}

/** Por plan. Se guarda en `PlatformSettings` bajo `claveAvisoVigencia(tenantId)`. */
export type RegistroAvisosVigencia = Record<string, RegistroAvisoPlan>;

export const claveAvisoVigencia = (tenantId: string): string => `loth-plan-aviso-vigencia:${tenantId}`;

export interface AvisoVencimientoPlan {
  planId: string;
  nombre: string;
  umbral: UmbralVencimiento;
  /** Los que quedan sellados si el aviso sale (el escalón y los más largos). */
  sellar: UmbralVencimiento[];
  hasta: string | null;
  diasQuedan: number | null;
  /** «viernes 20/03/2027». */
  vigenciaHasta: string | null;
  severidad: "HIGH" | "MEDIUM";
  /** «PO 12 vence en 30 días (jueves 14/01/2027)». */
  texto: string;
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

/** `AAAA-MM-DD` de lo que venga en `vigenciaHasta`. */
function claveFecha(v: PlanFichaApi["vigenciaHasta"]): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(typeof v === "string" && v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Lo enviado, si el registro habla del MISMO vencimiento; si no, nada. */
function enviadosVigentes(reg: RegistroAvisoPlan | undefined, hasta: string | null): UmbralVencimiento[] {
  if (!reg || reg.hasta !== hasta) return [];
  return Array.isArray(reg.enviados) ? reg.enviados : [];
}

/** El escalón que toca hoy y no se mandó, con lo que se sella; `null` si no toca ninguno. */
export function escalonQueToca(
  diasQuedan: number | null,
  enviados: readonly UmbralVencimiento[],
  conAvisoSinFecha = true,
): { umbral: UmbralVencimiento; sellar: UmbralVencimiento[] } | null {
  if (diasQuedan == null) {
    return conAvisoSinFecha && !enviados.includes("sin_fecha") ? { umbral: "sin_fecha", sellar: ["sin_fecha"] } : null;
  }
  if (diasQuedan < 0) return null;
  const tocan = UMBRALES_VENCIMIENTO.filter((u) => diasQuedan <= u);
  const pendientes = tocan.filter((u) => !enviados.includes(u));
  if (pendientes.length === 0) return null;
  const umbral = pendientes[pendientes.length - 1]!;
  return { umbral, sellar: tocan.filter((u) => u >= umbral) };
}

function textoDe(nombre: string, umbral: UmbralVencimiento, dias: number | null, fecha: string | null): string {
  if (umbral === "sin_fecha") return `${nombre} no tiene fecha de vencimiento: cárgala para que te avise antes de que venza.`;
  if (dias === 0) return `${nombre} vence HOY${fecha ? ` (${fecha})` : ""}: desde mañana no se puede talar ni movilizar con él.`;
  return `${nombre} vence en ${plural(dias ?? umbral, "día", "días")}${fecha ? ` (${fecha})` : ""}.`;
}

/** Qué hay que avisar hoy, plan por plan. No toca el registro. */
export function planearAvisosVencimiento(
  planes: readonly PlanFichaApi[],
  registro: RegistroAvisosVigencia | null | undefined,
  ahora: Date | number,
): AvisoVencimientoPlan[] {
  const reg = registro ?? {};
  const out: AvisoVencimientoPlan[] = [];
  for (const p of planes) {
    if (!p.isActive) continue;
    const f = construirFichaPermiso(null, p, ahora);
    if (f.estado === "cerrado" || f.estado === "suspendido" || f.estado === "vencido") continue;
    const hasta = claveFecha(p.vigenciaHasta);
    const dias = hasta ? f.diasQuedan : null;
    const toca = escalonQueToca(dias, enviadosVigentes(reg[p.id], hasta), !esTipoPlantacion(p.planType));
    if (!toca) continue;
    const nombre = nombreDelPlan(p);
    out.push({
      planId: p.id,
      nombre,
      umbral: toca.umbral,
      sellar: toca.sellar,
      hasta,
      diasQuedan: dias,
      vigenciaHasta: f.vigenciaHasta,
      severidad: toca.umbral === 0 || toca.umbral === 7 ? "HIGH" : "MEDIUM",
      texto: textoDe(nombre, toca.umbral, dias, f.vigenciaHasta),
    });
  }
  const orden = (a: AvisoVencimientoPlan) => (a.diasQuedan == null ? 9_999 : a.diasQuedan);
  return out.sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
}

/**
 * El registro con los avisos dados. Lo de otros planes queda como estaba;
 * los planes que ya no existen se limpian (`idsVivos`).
 */
export function sellarAvisos(
  registro: RegistroAvisosVigencia | null | undefined,
  avisos: readonly AvisoVencimientoPlan[],
  idsVivos?: readonly string[],
): RegistroAvisosVigencia {
  const out: RegistroAvisosVigencia = {};
  const vivos = idsVivos ? new Set(idsVivos) : null;
  for (const [id, r] of Object.entries(registro ?? {})) {
    if (!vivos || vivos.has(id)) out[id] = { hasta: r.hasta ?? null, enviados: [...(r.enviados ?? [])] };
  }
  for (const a of avisos) {
    const previos = enviadosVigentes(out[a.planId], a.hasta);
    out[a.planId] = { hasta: a.hasta, enviados: [...new Set([...previos, ...a.sellar])] };
  }
  return out;
}

/** Un WhatsApp por negocio con todos los planes del día. */
export function mensajeWhatsAppVencimiento(avisos: readonly AvisoVencimientoPlan[], nombreNegocio?: string | null): string {
  const cabeza = `${nombreNegocio ? `${nombreNegocio} · ` : ""}Libro TH — vigencia de ${avisos.length === 1 ? "tu plan" : "tus planes"}`;
  const lineas = avisos.map((a) => `• ${a.texto}`);
  return [cabeza, ...lineas, "Renueva a tiempo: con el plan vencido, la tala y la GTF quedan fuera de la ley."].join("\n");
}

/** Asunto del correo: el más urgente manda. */
export function asuntoCorreoVencimiento(avisos: readonly AvisoVencimientoPlan[]): string {
  const a = avisos[0];
  if (!a) return "Vigencia de tus planes de manejo";
  // «PO 12 vence en 30 días (jueves 14/01/2027)»: la frase sin el consejo de después de los dos puntos.
  const frase = a.texto.replace(/\.$/, "").split(":")[0] ?? a.texto;
  if (avisos.length === 1) return /^plan\b/i.test(frase) ? frase : `Plan ${frase}`;
  return `${avisos.length} planes de manejo por vencer`;
}
