/**
 * vigencia-avisos — avisar ANTES de que venza el papel con el que se trabaja.
 *
 * La vigencia se puede cargar en los dos lados —`ForestContrato.vigenciaHasta`
 * (el permiso) y `ForestPlan.vigenciaHasta` (el plan de manejo)— y hasta ahora
 * el único indicio era el color de una fila que había que estar mirando.
 * Comprar o despachar con el papel vencido **invalida la guía que se emita**:
 * es un dato de riesgo, no de contacto.
 *
 * PURO: recibe los papeles ya cargados y decide. `hoy` entra por parámetro, así
 * que la regla se testea sin depender del reloj de la máquina.
 *
 * ── Por qué 90 días y no 60 ni 30 ───────────────────────────────────────────
 * En el repo ya vivían TRES umbrales de «por vencer» y ninguno es del permiso
 * propio:
 *
 *   · `DIAS_AVISO_VENCIMIENTO` = 90 (`loth-plan-vigencia`) — el del PLAN, el
 *     que ya pinta la cabecera de la vista Plan;
 *   · `DIAS_AVISO_TITULO` = 60 (`directorio-salud`) — el del título de un
 *     PROVEEDOR: si está por vencer se le compra a otro, y eso se decide en
 *     días, no en meses;
 *   · `HORIZONTE_DOCUMENTO_DIAS` = 30 (`ctp-anticipa`) — los documentos de la
 *     Ficha del CTP.
 *
 * Acá se usa **uno solo, el de 90**, y se reusa entero `estadoVigencia`. Dos
 * razones: (1) el permiso y el plan son el mismo papel propio, renovarlo ante
 * la ARFFS toma meses —a 30 días el aviso llega cuando ya no se puede hacer
 * nada—; (2) la cabecera del Plan ya se pone en «por vencer» a los 90, y un
 * aviso que apareciera a los 60 llegaría después del color que explica: dos
 * cifras contiguas contándose distinto.
 *
 * Lo que NO enciende un aviso: **la vigencia sin cargar**. Eso no es un riesgo,
 * es un dato que falta, y ya lo reclama el panel «qué le falta a tus permisos»
 * (`CtpPermisosIncompletos`). Duplicarlo acá en rojo enseñaría a ignorar los
 * dos. Tampoco los papeles `cerrado` ni `suspendido`: ésas son decisiones
 * administrativas que el estado del papel ya dice, no un calendario que corre.
 */

import { DIAS_AVISO_VENCIMIENTO, estadoVigencia } from "./loth-plan-vigencia";
import { limaDateKey } from "@/lib/utils";

/** El mismo umbral del plan, re-exportado: el que lo lea no tiene que elegir. */
export { DIAS_AVISO_VENCIMIENTO };

export type ClasePapel = "permiso" | "plan";

/** Lo mínimo que hace falta de un papel para saber si hay que avisar. */
export interface PapelConVigencia {
  id: string;
  /**
   * Cómo se lo nombra en la guía. El código del permiso o el número del plan;
   * vacío se tolera (hay planes sin número cargado) y entonces el aviso habla
   * del papel sin inventarle un código.
   */
  codigo?: string | null;
  vigenciaHasta: string | Date | null | undefined;
  /** `vigente | vencido | cerrado | suspendido`, tal como lo guarda la base. */
  estado?: string | null;
  clase: ClasePapel;
}

export interface AvisoVigencia {
  /** Estable por papel: sirve de `key` y de clave de deduplicación. */
  clave: string;
  id: string;
  codigo: string;
  clase: ClasePapel;
  nivel: "vencido" | "por_vencer";
  /** Días hasta el vencimiento. **Negativo** = hace cuántos venció. */
  dias: number;
  gravedad: "urgente" | "proximo";
  /** Una línea con EL NÚMERO. */
  titulo: string;
  /** La consecuencia y qué hacer. */
  detalle: string;
}

/**
 * El «hoy» del libro, en día de Lima.
 *
 * A las 20:00 de Pucallpa el UTC ya es del día siguiente: un `new Date()` crudo
 * le restaría un día a todos los plazos justo en el turno de la tarde. Se arma
 * la medianoche UTC del día limeño para que la resta de `estadoVigencia`
 * —que compara días calendario en UTC— caiga en el día correcto.
 */
export function hoyDelLibro(ahora: Date | number = Date.now()): Date {
  return new Date(`${limaDateKey(ahora)}T00:00:00Z`);
}

/** Cómo se nombra cada clase de papel en el texto. */
const NOMBRE: Record<ClasePapel, string> = { permiso: "Permiso", plan: "Plan de manejo" };

const plural = (n: number) => (n === 1 ? "día" : "días");

/**
 * Qué se rompe cuando ese papel ya venció. Es la parte que convierte una fecha
 * en una razón: sin esto el aviso dice «venció» y el operario sigue cargando.
 */
function consecuenciaVencido(clase: ClasePapel): string {
  return clase === "permiso"
    ? "La guía que emitas con este papel queda observada: no compres ni despaches bajo este permiso hasta renovarlo ante la ARFFS."
    : "Con el plan vencido no puedes movilizar el saldo autorizado y la guía que emitas queda observada. Renuévalo ante la ARFFS antes de seguir talando.";
}

/** Y qué se pierde si se deja llegar la fecha. */
function consecuenciaPorVencer(clase: ClasePapel, dias: number): string {
  const cuando = dias === 0 ? "Desde mañana" : "Cuando venza";
  return clase === "permiso"
    ? `${cuando}, la guía que emitas con este papel queda observada. Renovarlo ante la ARFFS no sale el mismo día: empieza el trámite ahora.`
    : `${cuando}, la guía que emitas queda observada — y el saldo autorizado no pasa al período siguiente. Empieza la renovación ahora.`;
}

/**
 * El aviso de un papel, o `null` si no hay nada que avisar.
 *
 * `estadoVigencia` hace la cuenta y decide el nivel (incluido el caso de un
 * estado declarado que le gana al calendario); acá sólo se redacta.
 */
export function avisoDeVigencia(
  papel: PapelConVigencia,
  hoy: Date = hoyDelLibro(),
): AvisoVigencia | null {
  const e = estadoVigencia(papel.vigenciaHasta, papel.estado, hoy);

  // `cerrado`, `suspendido` y `sin_fecha` no son vencimientos (ver cabecera).
  if (e.nivel !== "vencido" && e.nivel !== "por_vencer") return null;
  if (e.diasRestantes == null) return null;

  const dias = e.diasRestantes;
  const codigo = (papel.codigo ?? "").trim();
  const nombre = codigo ? `${NOMBRE[papel.clase]} ${codigo}` : NOMBRE[papel.clase];
  const base = { clave: `vigencia-${papel.clase}-${papel.id}`, id: papel.id, codigo, clase: papel.clase };

  if (e.nivel === "vencido") {
    return {
      ...base,
      nivel: "vencido",
      dias,
      gravedad: "urgente",
      titulo: `${nombre} venció hace ${Math.abs(dias).toLocaleString("es-PE")} ${plural(Math.abs(dias))}`,
      detalle: consecuenciaVencido(papel.clase),
    };
  }

  return {
    ...base,
    nivel: "por_vencer",
    dias,
    /* Mismo escalón que el aviso hermano de documentos de la Ficha
       (`ctp-anticipa`): dentro de la semana es rojo, más lejos es azul. */
    gravedad: dias <= 7 ? "urgente" : "proximo",
    titulo: dias === 0
      ? `${nombre} vence hoy`
      : `${nombre} vence en ${dias.toLocaleString("es-PE")} ${plural(dias)}`,
    detalle: consecuenciaPorVencer(papel.clase, dias),
  };
}

/**
 * Todos los avisos de una lista de papeles, de lo más urgente a lo más lejano:
 * lo ya vencido primero (días negativos) y después lo que se viene.
 */
export function avisosDeVigencia(
  papeles: readonly PapelConVigencia[],
  hoy: Date = hoyDelLibro(),
): AvisoVigencia[] {
  return papeles
    .map((p) => avisoDeVigencia(p, hoy))
    .filter((a): a is AvisoVigencia => a !== null)
    .sort((a, b) => a.dias - b.dias);
}

/** Los que ya vencieron: van con lo que hay que corregir HOY, no con «se viene». */
export const vencidos = (avisos: readonly AvisoVigencia[]): AvisoVigencia[] =>
  avisos.filter((a) => a.nivel === "vencido");

/** Los que todavía se pueden salvar: van con «lo que se viene». */
export const porVencer = (avisos: readonly AvisoVigencia[]): AvisoVigencia[] =>
  avisos.filter((a) => a.nivel === "por_vencer");
