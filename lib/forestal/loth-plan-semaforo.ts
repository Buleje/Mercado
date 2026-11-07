/**
 * El semáforo del plan: verde, ámbar o rojo, con sus razones (Brandon 24-10,
 * opción A: «Semáforo antimulta»).
 *
 * Junta en UNA señal lo que hoy está repartido en cuatro lugares —la vigencia
 * de la ficha del permiso, el saldo por especie, el plazo de 15 días del libro
 * y la ficha del plan— para que el dueño vea de un vistazo si algo lo expone a
 * una observación de OSINFOR. El color es el de la peor razón; cada razón dice
 * qué pasa y en una frase.
 *
 * Reglas:
 *   · Vigencia (`estadoVigencia`, la misma cuenta que la ficha del permiso):
 *     vencido → rojo; ≤ 30 días → ámbar urgente; ≤ 90 → ámbar; sin fecha →
 *     ámbar «no te puedo avisar». En una PLANTACIÓN la vigencia es opcional
 *     (ADR-459): sin fecha es sólo informativo, o las tres plantaciones de Blas
 *     quedarían en ámbar para siempre y el ámbar dejaría de decir algo.
 *   · Saldo por especie (`cascadaDelPlan`), dos razones distintas porque las
 *     mira gente distinta (25-10): lo MOVILIZADO con GTF sobre lo autorizado
 *     baja el saldo ante SERFOR («Se pasó del saldo de guías»); lo TALADO
 *     sobre lo autorizado lo revisa OSINFOR en el campo. Las dos son rojo y
 *     salen las dos si pasan las dos. La tolerancia es UNA, la del freno de la
 *     guía (`excedeTechoM3`, 3 decimales): el semáforo no puede decir «se
 *     pasó» donde la guía pasa, ni al revés. Uso ≥ 90 % (lo mayor entre talado y movilizado) →
 *     ámbar.
 *   · Plazo del libro (`razonesPlazo`, 15 días calendario, RDE 264-2019): un
 *     despacho sin asentar fuera de plazo → rojo; por vencer → ámbar; lo
 *     asentado tarde esta semana → informativo. Es del LIBRO entero (un
 *     despacho no lleva plan): lo dice el aviso del libro, no cada plan.
 *   · Ficha incompleta (`loth-plan-ficha`) → ámbar.
 *   · Papeles del permiso (`loth-plan-papeles`): un obligatorio vencido →
 *     rojo; uno obligatorio que falta → ámbar; los «si aplica» no avisan.
 *   · Quién taló (motosierrista): informativo, no es obligatorio en el libro.
 *   · Cerrado → neutro (no se mira nada más); suspendido → rojo.
 *
 * Lo que no se pudo leer no es verde (25-10): en cada entrada, `undefined` =
 * no se juzga (todavía carga, o esa pantalla no lo tiene) y `null` = se pidió y
 * falló → ámbar «No pude leer…». Un semáforo verde porque falló una lectura
 * es peor que ninguno.
 *
 * PURO: recibe lo ya calculado; la pantalla y el cron no cuentan distinto.
 */
import { estadoVigencia } from "./loth-plan-vigencia";
import { esTipoPlantacion } from "./loth-tipos-plan";
import { excedeTechoM3 } from "./loth-t6";
import type { CascadaEspecie } from "./loth-saldo-cascada";
import type { FichaDelPlan } from "./loth-plan-ficha";

export type ColorSemaforo = "verde" | "ambar" | "rojo" | "neutro";
export type NivelRazon = "rojo" | "ambar" | "info";
export type ClaveRazon = "vigencia" | "saldo" | "plazo" | "tardias" | "ficha" | "papeles" | "motosierrista" | "estado";

export interface RazonSemaforo {
  clave: ClaveRazon;
  nivel: NivelRazon;
  /** Ámbar que ya aprieta (≤ 30 días para vencer). */
  urgente?: boolean;
  texto: string;
}

/** Lo que el libro ya contó del plazo de 15 días (`despachosSinAsentar`, `registrosTardiosRecientes`). */
export interface PlazosSemaforo {
  /** Despachos sin asentar que todavía están en plazo (o vencen hoy). */
  porVencer: number;
  /** Despachos sin asentar con el plazo pasado. */
  vencidos: number;
  /** Los días que le quedan al más apurado (0 = hoy, negativo = pasado). */
  quedanMin: number | null;
  /** Líneas asentadas fuera de plazo en la última semana. */
  tardias: number;
}

/** Los papeles del permiso como los lee el semáforo (`resumenParaSemaforo`). */
export interface PapelesSemaforo {
  requeridos: number;
  presentes: number;
  /** Nombres de los OBLIGATORIOS vencidos. */
  vencidos: readonly string[];
  /** Nombres de los OBLIGATORIOS que faltan. */
  faltan: readonly string[];
}

export interface DatosSemaforo {
  planType: string;
  estado: string | null | undefined;
  vigenciaHasta: string | Date | null | undefined;
  hoy: Date;
  /** Las especies de la cascada del plan. `undefined` = no se juzga; `null` = el saldo no se pudo leer. */
  especies?: readonly Pick<CascadaEspecie, "especie" | "baseM3" | "taladoM3" | "despachadoM3">[] | null;
  ficha?: Pick<FichaDelPlan, "pct" | "faltan"> | null;
  /** `resumenParaSemaforo` de los papeles del permiso. `null` = no se pudieron leer. */
  papeles?: PapelesSemaforo | null;
  /** Árboles talados o trozados del plan y cuántos dicen quién los taló. */
  talas?: { total: number; conMotosierrista: number } | null;
}

export interface SemaforoPlan {
  color: ColorSemaforo;
  /** «Al día» · «Revisa» · «Revisa pronto» · «Riesgo de multa» · «Cerrado». */
  titulo: string;
  /** De la más grave a la menos. */
  razones: RazonSemaforo[];
}

/** Desde qué uso del saldo se avisa. */
export const PCT_SALDO_AVISO = 90;
/** Desde cuántos días el vencimiento ya aprieta. */
export const DIAS_VIGENCIA_URGENTE = 30;

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;
const pctTexto = (p: number) => `${Math.round(p).toLocaleString("es-PE")} %`;

function razonesVigencia(d: DatosSemaforo): RazonSemaforo[] {
  const v = estadoVigencia(d.vigenciaHasta, d.estado, d.hoy);
  if (v.nivel === "vencido") {
    return [{ clave: "vigencia", nivel: "rojo", texto: `${v.texto}: con el plan vencido no se puede talar ni movilizar.` }];
  }
  if (v.nivel === "por_vencer") {
    const urgente = (v.diasRestantes ?? 0) <= DIAS_VIGENCIA_URGENTE;
    return [{ clave: "vigencia", nivel: "ambar", urgente, texto: `${v.texto}.` }];
  }
  if (v.nivel === "sin_fecha") {
    if (esTipoPlantacion(d.planType)) {
      return [{ clave: "vigencia", nivel: "info", texto: "Sin fecha de vencimiento: si el registro tiene una, cárgala y te aviso antes." }];
    }
    return [{ clave: "vigencia", nivel: "ambar", texto: "Sin fecha de vencimiento: no te puedo avisar antes de que venza." }];
  }
  return [];
}

const listaCorta = (xs: readonly string[], tope = 3) => `${xs.slice(0, tope).join(", ")}${xs.length > tope ? "…" : ""}`;

function razonesSaldo(d: DatosSemaforo): RazonSemaforo[] {
  if (d.especies === undefined) return [];
  if (d.especies === null) {
    return [{ clave: "saldo", nivel: "ambar", texto: "No pude leer el saldo del plan: recarga para ver si alguna especie se pasó." }];
  }
  if (d.especies.length === 0) {
    return [{ clave: "saldo", nivel: "ambar", texto: "Sin especies con saldo: no puedo medir si alguna se pasó." }];
  }
  const plantacion = esTipoPlantacion(d.planType);
  const deGuias: string[] = [];
  const talados: string[] = [];
  const cerca: string[] = [];
  for (const e of d.especies) {
    const sobreGuias = excedeTechoM3(e.despachadoM3, e.baseM3);
    const sobreTala = excedeTechoM3(e.taladoM3, e.baseM3);
    if (sobreGuias) deGuias.push(e.especie);
    if (sobreTala) talados.push(e.especie);
    if (sobreGuias || sobreTala) continue;
    const usado = Math.max(e.taladoM3, e.despachadoM3);
    if (e.baseM3 > 0 && (usado / e.baseM3) * 100 >= PCT_SALDO_AVISO) {
      cerca.push(`${e.especie} (${pctTexto((usado / e.baseM3) * 100)})`);
    }
  }
  const out: RazonSemaforo[] = [];
  if (deGuias.length > 0) {
    out.push({ clave: "saldo", nivel: "rojo", texto: `Se pasó del saldo de guías: ${listaCorta(deGuias)}.` });
  }
  if (talados.length > 0) {
    // OSINFOR supervisa títulos habilitantes; una plantación se registra, no la supervisa.
    out.push({
      clave: "saldo",
      nivel: "rojo",
      texto: plantacion
        ? `Se taló más de lo registrado: ${listaCorta(talados)}.`
        : `Se taló más de lo autorizado: ${listaCorta(talados)} (lo revisa OSINFOR).`,
    });
  }
  if (cerca.length > 0) {
    out.push({ clave: "saldo", nivel: "ambar", texto: `Saldo casi usado: ${listaCorta(cerca)}.` });
  }
  return out;
}

/**
 * El plazo de 15 días del libro. Exportada para el aviso del LIBRO
 * (`LothPlazosDelLibroAviso`): un despacho no lleva plan, así que no va en el
 * semáforo de ninguno. `null` = no se pudo leer.
 */
export function razonesPlazo(p: PlazosSemaforo | null | undefined): RazonSemaforo[] {
  if (p === undefined) return [];
  if (p === null) {
    return [{ clave: "plazo", nivel: "ambar", texto: "No pude leer los plazos de 15 días del libro: recarga para ver si hay despachos por asentar." }];
  }
  const out: RazonSemaforo[] = [];
  if (p.vencidos > 0) {
    out.push({
      clave: "plazo",
      nivel: "rojo",
      texto: `${plural(p.vencidos, "despacho", "despachos")} sin asentar pasado el plazo de 15 días.`,
    });
  }
  if (p.porVencer > 0) {
    const cuando = p.quedanMin == null ? "" : p.quedanMin <= 0 ? ": vence hoy" : `: quedan ${plural(p.quedanMin, "día", "días")}`;
    out.push({
      clave: "plazo",
      nivel: "ambar",
      urgente: (p.quedanMin ?? 99) <= 2,
      texto: `${plural(p.porVencer, "despacho por asentar", "despachos por asentar")}${cuando}.`,
    });
  }
  if (p.tardias > 0) {
    out.push({
      clave: "tardias",
      nivel: "info",
      texto: `${plural(p.tardias, "línea se asentó", "líneas se asentaron")} fuera de plazo esta semana.`,
    });
  }
  return out;
}

function razonesFicha(d: DatosSemaforo): RazonSemaforo[] {
  const out: RazonSemaforo[] = [];
  if (d.ficha && d.ficha.faltan.length > 0) {
    const f = d.ficha.faltan[0]?.falta ?? "";
    // «Falta su RUC o DNI» → «falta su RUC o DNI»: sólo la primera letra, las siglas quedan.
    const frase = f ? `${f.charAt(0).toLowerCase()}${f.slice(1)}` : "faltan datos";
    const mas = d.ficha.faltan.length > 1 ? ` y ${plural(d.ficha.faltan.length - 1, "dato más", "datos más")}` : "";
    out.push({ clave: "ficha", nivel: "ambar", texto: `Ficha al ${d.ficha.pct} %: ${frase}${mas}.` });
  }
  if (d.talas && d.talas.total > 0 && d.talas.conMotosierrista < d.talas.total) {
    out.push({
      clave: "motosierrista",
      nivel: "info",
      // Por árbol (`loth-plan-semaforo-libro`): un árbol trozado en cuatro es uno solo.
      texto: `${d.talas.conMotosierrista.toLocaleString("es-PE")} de ${plural(d.talas.total, "árbol dice quién lo taló", "árboles dicen quién los taló")}.`,
    });
  }
  return out;
}

function razonesPapeles(p: PapelesSemaforo | null | undefined): RazonSemaforo[] {
  if (p === undefined) return [];
  if (p === null) {
    return [{ clave: "papeles", nivel: "ambar", texto: "No pude leer los papeles del permiso: recarga para ver si falta alguno." }];
  }
  const out: RazonSemaforo[] = [];
  if (p.vencidos.length > 0) {
    out.push({
      clave: "papeles",
      nivel: "rojo",
      texto: p.vencidos.length === 1 ? `Papel vencido: ${p.vencidos[0]}.` : `${p.vencidos.length} papeles vencidos: ${listaCorta(p.vencidos, 2)}.`,
    });
  }
  if (p.faltan.length > 0) {
    out.push({
      clave: "papeles",
      nivel: "ambar",
      texto: `${p.faltan.length === 1 ? "Falta" : "Faltan"} ${plural(p.faltan.length, "papel", "papeles")} de ${p.requeridos}: ${listaCorta(p.faltan, 2)}.`,
    });
  }
  return out;
}

const ORDEN: Record<NivelRazon, number> = { rojo: 0, ambar: 1, info: 2 };

export function semaforoDelPlan(d: DatosSemaforo): SemaforoPlan {
  const declarado = (d.estado ?? "").trim().toLowerCase();
  if (declarado === "cerrado") {
    return { color: "neutro", titulo: "Cerrado", razones: [{ clave: "estado", nivel: "info", texto: "El plan está cerrado: no se mira su saldo ni su vigencia." }] };
  }
  const razones: RazonSemaforo[] = [];
  if (declarado === "suspendido") {
    razones.push({ clave: "estado", nivel: "rojo", texto: "El plan está suspendido: no se puede talar ni movilizar con él." });
  } else {
    razones.push(...razonesVigencia(d));
  }
  // Los plazos de 15 días NO entran (B5): son del libro entero y los dice su aviso (`razonesPlazo`).
  razones.push(...razonesSaldo(d), ...razonesFicha(d), ...razonesPapeles(d.papeles));
  razones.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel] || Number(Boolean(b.urgente)) - Number(Boolean(a.urgente)));

  const peor = razones[0]?.nivel;
  if (peor === "rojo") return { color: "rojo", titulo: "Riesgo de multa", razones };
  if (peor === "ambar") return { color: "ambar", titulo: razones[0]?.urgente ? "Revisa pronto" : "Revisa", razones };
  return { color: "verde", titulo: "Al día", razones };
}

/** Cuántas razones de cada nivel: para la línea de la lista de planes. */
export function cuentaDeRazones(s: Pick<SemaforoPlan, "razones">): Record<NivelRazon, number> {
  const c: Record<NivelRazon, number> = { rojo: 0, ambar: 0, info: 0 };
  for (const r of s.razones) c[r.nivel] += 1;
  return c;
}
