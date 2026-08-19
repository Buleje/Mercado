/**
 * Lo que vence en los próximos días.
 *
 * Todo el módulo mira hacia atrás: quién ya se atrasó, cuánto hace, a quién
 * reclamarle. Nada mira hacia adelante. La plata se recupera mucho mejor
 * avisando tres días ANTES —«mañana vence lo tuyo»— que persiguiendo treinta
 * días después, y el dato para hacerlo ya está en la base desde que existe
 * `Adelanto.fechaVencimiento` y las entregas pactadas.
 *
 * Vive fuera del componente porque decide a quién se le escribe: se prueba sin
 * renderizar nada.
 */

import type { DbAdelanto } from "@/lib/db/adelantos.db";

const DIA = 86_400_000;

export type CompromisoProximo = {
  adelantoId: string;
  codigoOperacion: string | null;
  beneficiarioId: string;
  nombre: string;
  telefono: string | null;
  /** Qué se espera: una cuota concreta o la devolución del adelanto entero. */
  concepto: string;
  /** Cuánto se espera recibir. */
  monto: number;
  moneda: string;
  fecha: string;
  /** Días que faltan. 0 = hoy, 1 = mañana. Nunca negativo (eso ya es atraso). */
  faltan: number;
  origen: "cuota" | "adelanto";
};

/** Sólo el día, sin hora: comparar «vence hoy» con timestamps es una trampa. */
function aMedianoche(v: string | Date): number {
  const d = v instanceof Date ? new Date(v) : new Date(v);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Los compromisos que caen entre hoy y dentro de `dias`, del más cercano al más
 * lejano.
 *
 * Lo YA vencido queda afuera a propósito: de eso se ocupa la cobranza, y
 * mezclarlo acá convertiría el aviso preventivo en otra lista de reclamos.
 */
export function proximosVencimientos(
  adelantos: readonly DbAdelanto[],
  dias = 7,
  ahora: number = Date.now(),
): CompromisoProximo[] {
  const hoy = aMedianoche(new Date(ahora));
  const tope = hoy + dias * DIA;
  const out: CompromisoProximo[] = [];

  for (const a of adelantos) {
    if (a.status !== "ABIERTO" || !(a.saldoPendiente > 0)) continue;

    const base = {
      adelantoId: a.id,
      codigoOperacion: a.codigoOperacion ?? null,
      beneficiarioId: a.beneficiarioId,
      nombre: a.beneficiario?.nombre ?? "—",
      telefono: a.beneficiario?.telefono ?? null,
      moneda: a.moneda,
    };

    /* Las cuotas pactadas son el compromiso más fino: si las hay, son ellas las
       que vencen, no el adelanto entero. */
    const cuotas = a.entregasPactadas.filter((p) => !p.cumplidaEn && p.fechaEsperada);
    for (const p of cuotas) {
      const dia = aMedianoche(p.fechaEsperada!);
      if (dia < hoy || dia > tope) continue;
      out.push({
        ...base,
        concepto: p.descripcionEsperada,
        monto: p.valorEsperado,
        fecha: p.fechaEsperada!,
        faltan: Math.round((dia - hoy) / DIA),
        origen: "cuota",
      });
    }

    /* La fecha del adelanto entero sólo cuenta si NO hay cuotas pendientes:
       con un plan cargado, avisar las dos cosas es avisar dos veces lo mismo. */
    if (cuotas.length === 0 && a.fechaVencimiento) {
      const dia = aMedianoche(a.fechaVencimiento);
      if (dia >= hoy && dia <= tope) {
        out.push({
          ...base,
          concepto: "Devolución acordada",
          monto: a.saldoPendiente,
          fecha: a.fechaVencimiento,
          faltan: Math.round((dia - hoy) / DIA),
          origen: "adelanto",
        });
      }
    }
  }

  return out.sort((x, y) => x.faltan - y.faltan || y.monto - x.monto);
}

/** Cómo se dice cuándo, en la unidad en que uno lo diría en voz alta. */
export function cuandoVence(faltan: number): string {
  if (faltan <= 0) return "hoy";
  if (faltan === 1) return "mañana";
  return `en ${faltan} días`;
}

/** Lo que se espera cobrar en la ventana, para el titular. */
export function totalProximo(compromisos: readonly CompromisoProximo[]): number {
  return Math.round(compromisos.reduce((s, c) => s + c.monto, 0) * 100) / 100;
}
