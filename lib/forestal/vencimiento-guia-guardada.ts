/**
 * Cuánto le queda a una guía guardada antes de vencer (ADR-442 + ADR-434
 * §Vencimiento).
 *
 * Pedido de Brandon (2026-09-27), medido en Blas: 11 de 12 guías llegaron
 * DESPUÉS de su fecha de vencimiento. Una guía guardada que todavía espera su
 * madera tiene que decir cuánto le queda («vence en 2 días», «vence hoy»,
 * «vencida hace 3 días») para llamar al transportista a tiempo.
 *
 * De dónde sale la fecha: la ficha de SERFOR que guardó el servidor
 * (`resumen.fechaVencimiento`, «dd/mm/aaaa»; en el detalle también
 * `serforGtf.fechaVencimiento`). Se lee con `vencimientoDeGuia`, la MISMA regla
 * del libro: un vencimiento anterior a la expedición es un papel mal leído y se
 * descarta. Sin ficha no hay fecha, y nunca se estima una.
 *
 * PURO y client-safe. Fechas `AAAA-MM-DD` date-only, restadas en UTC; el «hoy»
 * lo pone quien llama con `limaDateKey()` (el día civil de Pucallpa, no el de
 * UTC: pasadas las 19:00 la guía «vencía» un día antes).
 */

import { esDiaValido, vencimientoDeGuia } from "./fecha-de-llegada";
import type { GuiaGuardadaVista } from "./guias-guardadas";
import { diaConNombre } from "./plazo-de-apartado";
import { limaDateKey } from "@/lib/utils";

/** «Vence pronto» = le quedan estos días o menos (hoy no cuenta: tiene su propio tono). */
export const DIAS_VENCE_PRONTO = 2;

export type TonoVencimiento = "vencida" | "hoy" | "pronto" | "ok";

export type VencimientoGuardada =
  | {
      tono: TonoVencimiento;
      /** `AAAA-MM-DD`. */
      vencimiento: string;
      /** Del día de hoy al vencimiento: negativo = ya venció. */
      dias: number;
      /** Lo que dice el chip. */
      texto: string;
      /** La frase entera, para el `title` y el lector de pantalla. */
      detalle: string;
    }
  | { tono: "sin_fecha"; vencimiento: null; dias: null; texto: string; detalle: string };

const DIA_MS = 86_400_000;
const aUtc = (dia: string): number => Date.parse(`${dia}T00:00:00.000Z`);
const dias = (n: number) => `${n} día${n === 1 ? "" : "s"}`;

/** Lo que hace falta de la guía guardada (la vista de la lista o el detalle con su ficha). */
export type GuiaConFicha = Pick<GuiaGuardadaVista, "resumen" | "gtfDate" | "verificadaEnSerfor"> & {
  serforGtf?: unknown;
};

export function vencimientoDeGuiaGuardada(g: GuiaConFicha, hoy: string): VencimientoGuardada {
  const hoyDeLima = esDiaValido(hoy) ? hoy : limaDateKey();
  // La expedición de la ficha ya vive en `gtfDate` cuando la guía está
  // verificada (`fusionarConFicha`): sirve para descartar un vencimiento imposible.
  const expedicion = g.verificadaEnSerfor ? g.gtfDate : null;
  const { vencimiento } = vencimientoDeGuia([
    { serforGtf: { fechaVencimiento: g.resumen?.fechaVencimiento ?? null, fechaExpedicion: expedicion } },
    { serforGtf: g.serforGtf },
  ]);

  if (!vencimiento) {
    return g.verificadaEnSerfor
      ? {
          tono: "sin_fecha",
          vencimiento: null,
          dias: null,
          texto: "sin fecha de vencimiento",
          detalle: "La ficha de SERFOR no trae una fecha de vencimiento que se pueda leer: revísala en el papel de la guía.",
        }
      : {
          tono: "sin_fecha",
          vencimiento: null,
          dias: null,
          texto: "sin fecha de vencimiento",
          detalle: "Sin fecha de vencimiento: búscala en SERFOR con su N° de registro.",
        };
  }

  const d = Math.round((aUtc(vencimiento) - aUtc(hoyDeLima)) / DIA_MS);
  const cuando = diaConNombre(vencimiento);
  if (d < 0) {
    return {
      tono: "vencida",
      vencimiento,
      dias: d,
      texto: `vencida hace ${dias(-d)}`,
      detalle: `La guía venció el ${cuando} y la madera todavía no entró. Si llegó antes, regístrala con esa fecha; si llegó después, el libro te pide confirmarlo con el motivo.`,
    };
  }
  if (d === 0) {
    return {
      tono: "hoy",
      vencimiento,
      dias: 0,
      texto: "vence hoy",
      detalle: `La guía vence hoy, ${cuando}: si la madera llega mañana, viaja con la guía vencida.`,
    };
  }
  return {
    tono: d <= DIAS_VENCE_PRONTO ? "pronto" : "ok",
    vencimiento,
    dias: d,
    texto: d === 1 ? "vence mañana" : `vence en ${dias(d)}`,
    detalle: `La guía vence el ${cuando}. Si la madera llega después, viaja con la guía vencida.`,
  };
}

/** Lo que cuenta el aviso de la bandeja. */
export interface CuentaDeVencimientos {
  vencidas: number;
  hoy: number;
  pronto: number;
  sinFecha: number;
}

export function contarVencimientos(v: readonly VencimientoGuardada[]): CuentaDeVencimientos {
  const c: CuentaDeVencimientos = { vencidas: 0, hoy: 0, pronto: 0, sinFecha: 0 };
  for (const x of v) {
    if (x.tono === "vencida") c.vencidas++;
    else if (x.tono === "hoy") c.hoy++;
    else if (x.tono === "pronto") c.pronto++;
    else if (x.tono === "sin_fecha") c.sinFecha++;
  }
  return c;
}

/** «1 vence hoy · 2 vencen pronto · 1 vencida», o `[]` si ninguna apura. */
export function trozosDelAviso(c: CuentaDeVencimientos): { tono: "vencida" | "hoy" | "pronto"; texto: string }[] {
  const t: { tono: "vencida" | "hoy" | "pronto"; texto: string }[] = [];
  if (c.hoy) t.push({ tono: "hoy", texto: `${c.hoy} ${c.hoy === 1 ? "vence" : "vencen"} hoy` });
  if (c.pronto) t.push({ tono: "pronto", texto: `${c.pronto} ${c.pronto === 1 ? "vence" : "vencen"} pronto` });
  if (c.vencidas) t.push({ tono: "vencida", texto: `${c.vencidas} ${c.vencidas === 1 ? "vencida" : "vencidas"}` });
  return t;
}

/**
 * Por vencimiento: la fecha más vieja arriba (las vencidas, que ya están
 * tarde), después la que vence hoy, las que vencen pronto, el resto, y al final
 * las que no tienen fecha. Entre iguales se respeta el orden que traía la
 * lista (el del servidor: lo más nuevo arriba).
 */
export function ordenarPorVencimiento<T extends GuiaConFicha>(guias: readonly T[], hoy: string): T[] {
  return guias
    .map((g, i) => ({ g, i, v: vencimientoDeGuiaGuardada(g, hoy) }))
    .sort((a, b) => {
      const va = a.v.vencimiento;
      const vb = b.v.vencimiento;
      if (va !== vb) {
        if (!va) return 1;
        if (!vb) return -1;
        return va < vb ? -1 : 1;
      }
      return a.i - b.i;
    })
    .map((x) => x.g);
}
