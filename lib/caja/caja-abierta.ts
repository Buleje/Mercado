/**
 * lib/caja/caja-abierta.ts — cuánto hace que la caja sigue abierta, en días de Lima.
 *
 * Una bodega abre y cierra caja en el día (el cron la cierra pasadas 16 horas):
 * una caja abierta desde un día anterior es un arqueo que no se hizo, y todo lo
 * que entra después (ventas, adelantos, liquidaciones) cae en ese cuadre viejo.
 * Medido 2026-09-14: el negocio real tenía una caja abierta desde el 11/06, 95 días.
 *
 * Los días son de CALENDARIO en America/Lima, no bloques de 24 h en UTC: una caja
 * abierta a las 23:30 y vista a las 08:00 ya es «desde ayer». Puro, para testearlo.
 *
 * 2026-09-30: además de la fecha, dice QUÉ hay adentro (ventas y efectivo
 * esperado). Medido: la caja real llevaba 111 días abierta con S/ 100 de
 * apertura y 3 ventas — cerrarla daba miedo porque nadie sabía cuánto contar.
 * La cuenta llega hecha del backend (lib/caja/efectivo-esperado.ts, la misma
 * del cierre); acá sólo se redacta.
 */

import { formatCurrency } from "@/lib/currency";
import type { CuentaCaja } from "@/lib/caja/efectivo-esperado";

const ZONA = "America/Lima";
const CLAVE_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function aFecha(v: string | Date): Date | null {
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Días de calendario de Lima entre `desde` y `ahora` (0 = el mismo día). */
export function diasCalendarioLima(desde: string | Date, ahora: Date = new Date()): number | null {
  const d = aFecha(desde);
  if (!d) return null;
  const inicio = Date.parse(`${CLAVE_DIA.format(d)}T00:00:00Z`);
  const fin = Date.parse(`${CLAVE_DIA.format(ahora)}T00:00:00Z`);
  return Math.round((fin - inicio) / 86_400_000);
}

/** «jueves 11/06», en la zona de Lima. */
export function fechaCortaLima(v: string | Date): string {
  const d = aFecha(v);
  if (!d) return "";
  const [anio, mes, dia] = CLAVE_DIA.format(d).split("-");
  const diaSemana = DIAS_SEMANA[new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia))).getUTCDay()];
  return `${diaSemana} ${dia}/${mes}`;
}

export interface AvisoCajaAbierta {
  /** Incluye la fecha de apertura: descartar el aviso de una caja no oculta el de la siguiente. */
  id: string;
  dias: number;
  severidad: "warning" | "urgent";
  titulo: string;
  /** «desde el jueves 11/06». */
  desde: string;
  /**
   * Lo que va en la fila compacta del banner: con cuenta, «3 ventas · S/ 245.00
   * esperados en efectivo»; sin cuenta (backend viejo), la fecha.
   */
  resumen: string;
  detalle: string;
  /** Efectivo que debería haber, si el backend mandó la cuenta. */
  efectivoEsperado: number | null;
}

/** Ventas + cuenta de efectivo de la caja, calculadas en el backend. */
export type CuentaCajaAbierta = { ventas: number } & CuentaCaja;

function ventasTexto(n: number): string {
  if (n <= 0) return "sin ventas";
  return n === 1 ? "1 venta" : `${n} ventas`;
}

/** «Desde entonces: 3 ventas, S/ 145.00 en efectivo, egresos S/ 20.00.» */
function desgloseTexto(c: CuentaCajaAbierta): string {
  const partes = [ventasTexto(c.ventas)];
  if (c.ventas > 0) partes.push(`${formatCurrency(c.ventasEfectivo)} en efectivo`);
  if (c.ingresos > 0) partes.push(`ingresos ${formatCurrency(c.ingresos)}`);
  if (c.egresos > 0) partes.push(`egresos ${formatCurrency(c.egresos)}`);
  return `Desde entonces: ${partes.join(", ")}.`;
}

/** `null` si no hay caja abierta, la fecha no sirve o se abrió hoy (en Lima). */
export function avisoCajaAbierta(
  desde: string | Date | null | undefined,
  ahora: Date = new Date(),
  cuenta: CuentaCajaAbierta | null = null,
): AvisoCajaAbierta | null {
  if (!desde) return null;
  const d = aFecha(desde);
  const dias = d ? diasCalendarioLima(d, ahora) : null;
  if (!d || dias === null || dias < 1) return null;
  const fecha = fechaCortaLima(d);
  const base = {
    id: `caja-abierta-${CLAVE_DIA.format(d)}`,
    dias,
    severidad: dias >= 7 ? "urgent" : "warning",
    titulo: dias === 1 ? "La caja quedó abierta desde ayer" : `La caja está abierta hace ${dias} días`,
    desde: `desde el ${fecha}`,
  } as const;
  const cola = "las ventas, adelantos y liquidaciones siguen cayendo en ese cuadre.";

  if (!cuenta || !Number.isFinite(cuenta.esperado)) {
    return { ...base, resumen: base.desde, detalle: `Se abrió el ${fecha}. Cuenta el efectivo y ciérrala: ${cola}`, efectivoEsperado: null };
  }

  const abrio = `Se abrió el ${fecha} con ${formatCurrency(cuenta.apertura)}. ${desgloseTexto(cuenta)}`;
  // Un esperado negativo no existe en un cajón (lib/caja/arqueo-veredicto): no
  // se lo presenta como «lo que hay que contar».
  if (cuenta.esperado < 0) {
    return {
      ...base,
      resumen: `${ventasTexto(cuenta.ventas)} · el efectivo esperado da negativo`,
      detalle: `${abrio} El efectivo esperado da ${formatCurrency(cuenta.esperado)}: revisa los egresos antes de cerrar.`,
      efectivoEsperado: cuenta.esperado,
    };
  }
  return {
    ...base,
    resumen: `${ventasTexto(cuenta.ventas)} · ${formatCurrency(cuenta.esperado)} esperados en efectivo`,
    detalle: `${abrio} Cuenta el efectivo: deberías tener ${formatCurrency(cuenta.esperado)}. Ciérrala pronto: ${cola}`,
    efectivoEsperado: cuenta.esperado,
  };
}
