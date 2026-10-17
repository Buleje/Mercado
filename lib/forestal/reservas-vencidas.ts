/**
 * Reservas vencidas del patio → pendientes del libro (2026-09-23).
 *
 * Una reserva (ADR-418) no se libera sola al vencer: queda marcada en rojo en su
 * fila de Productos disponibles para que alguien la suelte. Pero esa pastilla
 * sólo se ve si se está mirando ESA fila, y una reserva vencida que nadie soltó
 * es stock congelado por error: nadie más ofrece esa madera. Medido en Blas el
 * 23/09: el paquete SL-7 de la corrida N° 29 (Cachimbo) seguía «para Juancho»
 * con plazo del lunes 22/09.
 *
 * Esto decide cuáles son y cómo se nombran; la campana de avisos las lista con
 * «Liberar» y «Extender» al lado. PURO: sin fetch ni reloj propio — `ahora`
 * entra por parámetro.
 *
 * WhatsApp (queda para otra ronda): el cron diario `app/api/cron/forestal-plazos`
 * arma su mensaje en `lib/forestal/ctp-aviso-plazos.ts` (`construirAviso`). Ahí se
 * engancharía `ForestCtpDB.reservasVencidas(tenantId, new Date())` como una línea
 * más, con el mismo anti-spam de 20 h.
 */

import { formatNumber } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { diaConNombre, plazoDeApartado, sumarDias } from "./plazo-de-apartado";

/** Cuánto propone «Extender»: una semana desde HOY (no desde el plazo viejo, que ya pasó). */
export const DIAS_EXTENSION = 7;

/** Una reserva como la lee el servidor, con su fila del patio. */
export interface ApartadoConPlazo {
  id: string;
  para: string;
  /** Día date-only «YYYY-MM-DD». `null` = sin plazo: no vence nunca. */
  hasta: string | null;
  /** Cuándo se soltó. Una reserva liberada ya no congela nada. */
  liberadoAt: string | Date | null;
  lineNo: number;
  especie: string | null;
  producto: string | null;
  /** Código del paquete apartado; `null` = la corrida entera. */
  paqueteCodigo: string | null;
  /** m³ del paquete apartado. `null` en la corrida entera: su disponible no se deriva acá. */
  volumenM3: number | null;
}

export interface ReservaVencida {
  id: string;
  para: string;
  hasta: string;
  lineNo: number;
  especie: string | null;
  producto: string | null;
  paqueteCodigo: string | null;
  volumenM3: number | null;
  /** Días desde el plazo (≥ 1). */
  diasVencida: number;
}

/**
 * ¿Esta reserva está vencida hoy? Por DÍA en Lima, con la misma cuenta que pinta
 * la celda: vence el día siguiente al `hasta`, nunca por hora.
 */
export function esReservaVencida(
  a: Pick<ApartadoConPlazo, "hasta" | "liberadoAt">,
  ahora: Date,
): boolean {
  if (a.liberadoAt) return false;
  return plazoDeApartado(a.hasta, ahora).estado === "vencido";
}

/**
 * Las vencidas, la más vieja primero: es la que más tiempo lleva frenando madera.
 * A igual antigüedad, por N° de corrida, para que el orden no baile entre cargas.
 */
export function reservasVencidas(
  filas: readonly ApartadoConPlazo[],
  ahora: Date,
): ReservaVencida[] {
  const vencidas: ReservaVencida[] = [];
  for (const f of filas) {
    if (!f.hasta || !esReservaVencida(f, ahora)) continue;
    const dias = plazoDeApartado(f.hasta, ahora).dias ?? 0;
    vencidas.push({
      id: f.id,
      para: f.para,
      hasta: f.hasta.slice(0, 10),
      lineNo: f.lineNo,
      especie: f.especie,
      producto: f.producto,
      paqueteCodigo: f.paqueteCodigo,
      volumenM3: f.volumenM3,
      diasVencida: -dias,
    });
  }
  return vencidas.sort((a, b) => b.diasVencida - a.diasVencida || a.lineNo - b.lineNo);
}

const hace = (n: number) => `hace ${formatNumber(n, 0)} día${n === 1 ? "" : "s"}`;

/** «Reserva vencida: N° 29 Cachimbo para Juancho, venció el lunes 22/09 (hace 1 día)». */
export function textoReservaVencida(r: ReservaVencida): string {
  const especie = r.especie?.trim() ? ` ${r.especie.trim()}` : "";
  const para = r.para.trim().replace(/\.$/, "");
  return (
    `Reserva vencida: N° ${r.lineNo}${especie} para ${para}, ` +
    `venció el ${diaConNombre(r.hasta)} (${hace(r.diasVencida)})`
  );
}

/** Qué madera es: «Paquete SL-7 · 1.250 m³ · MADERA ASERRADA» o «Corrida entera · …». */
export function detalleReservaVencida(r: ReservaVencida): string {
  return [
    r.paqueteCodigo ? `Paquete ${r.paqueteCodigo}` : "Corrida entera",
    r.paqueteCodigo && r.volumenM3 != null ? `${formatNumber(r.volumenM3, 3)} m³` : null,
    r.producto?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** El plazo que propone «Extender»: hoy (Lima) + `DIAS_EXTENSION`. */
export function plazoPropuesto(ahora: Date, dias: number = DIAS_EXTENSION): string {
  return sumarDias(limaDateKey(ahora), dias);
}

/** «1 reserva vencida» · «3 reservas vencidas». */
export function resumenReservasVencidas(n: number): string {
  return `${formatNumber(n, 0)} ${n === 1 ? "reserva vencida" : "reservas vencidas"}`;
}
