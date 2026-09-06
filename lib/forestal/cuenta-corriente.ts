/**
 * cuenta-corriente — lo que se le debe (o le debe) a cada parte (ADR-322).
 *
 * ## Por qué existe
 *
 * El aserradero no cierra cada trato al contado: le adelanta plata a un titular
 * contra la madera que va a traer, le presta aserrío a otro, le descuenta el
 * flete que pagó por él. Todo eso vivía en un cuaderno y al liquidar nadie
 * coincidía en el número.
 *
 * ## El saldo se DERIVA, nunca se guarda
 *
 * `saldo = Σ cargos − Σ abonos`. Guardar un `saldo` mutable crea dos verdades y
 * la primera corrección lo desincroniza — la misma razón por la que las
 * existencias del libro salen de ingresos y consumos en vez de un contador.
 *
 * **Signo:** saldo positivo = la parte le debe al CTP. Negativo = el CTP le debe.
 * Se dice con palabras en la UI, porque "saldo −1200" no lo lee igual el dueño
 * que el contador.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { z } from "zod";

export const TIPOS_MOV = ["cargo", "abono"] as const;
export type TipoMov = (typeof TIPOS_MOV)[number];

/** Qué originó el movimiento. El concepto define el tipo natural, no al revés. */
export const CONCEPTOS = [
  "adelanto",
  "flete",
  "aserrio_prestado",
  "aserrio_recibido",
  "pago",
  "madera",
  "otro",
] as const;
export type Concepto = (typeof CONCEPTOS)[number];

export const CONCEPTO_LABEL: Record<Concepto, string> = {
  adelanto: "Adelanto entregado",
  flete: "Flete a su cargo",
  aserrio_prestado: "Aserrío prestado",
  aserrio_recibido: "Aserrío recibido",
  pago: "Pago recibido",
  madera: "Madera recibida",
  otro: "Otro",
};

/**
 * El tipo que corresponde a cada concepto. Se sugiere, no se impone: hay
 * devoluciones y ajustes que van al revés, y forzarlo obligaría a inventar un
 * concepto falso para registrar la realidad.
 */
export const TIPO_SUGERIDO: Record<Concepto, TipoMov> = {
  adelanto: "cargo",
  flete: "cargo",
  aserrio_prestado: "cargo",
  aserrio_recibido: "abono",
  pago: "abono",
  madera: "abono",
  otro: "cargo",
};

export interface MovimientoCuenta {
  id: string;
  parteId: string;
  parteNombre: string;
  fecha: string;
  tipo: TipoMov;
  concepto: Concepto;
  monto: number;
  moneda: string;
  referencia: string | null;
  fleteId: string | null;
  notas: string | null;
}

const texto = (max: number) => z.string().trim().max(max);

export const movimientoInputSchema = z.object({
  parteId: texto(40).min(1, "Elegí con quién es la cuenta"),
  parteNombre: texto(200).min(1),
  fecha: texto(10).min(10, "La fecha es obligatoria"),
  tipo: z.enum(TIPOS_MOV),
  concepto: z.enum(CONCEPTOS),
  monto: z.number().positive("El monto tiene que ser mayor a cero").max(9_999_999),
  moneda: texto(4).optional(),
  referencia: texto(80).optional(),
  fleteId: texto(40).optional().nullable(),
  notas: texto(500).optional(),
});
export type MovimientoInput = z.infer<typeof movimientoInputSchema>;

export interface SaldoParte {
  parteId: string;
  parteNombre: string;
  cargos: number;
  abonos: number;
  /** cargos − abonos. Positivo = la parte le debe al CTP. */
  saldo: number;
  movimientos: number;
  /** ISO del último movimiento — para ordenar por actividad. */
  ultimo: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Saldo de una lista de movimientos (de una parte o de varias). */
export function calcularSaldo(movs: MovimientoCuenta[]): { cargos: number; abonos: number; saldo: number } {
  let cargos = 0;
  let abonos = 0;
  for (const m of movs) {
    if (m.tipo === "cargo") cargos += m.monto;
    else abonos += m.monto;
  }
  return { cargos: r2(cargos), abonos: r2(abonos), saldo: r2(cargos - abonos) };
}

/**
 * Una fila por parte, ordenada por lo que más se debe. Las cuentas saldadas
 * (saldo 0) van al final: existen, pero no son lo que se viene a mirar.
 */
export function saldosPorParte(movs: MovimientoCuenta[]): SaldoParte[] {
  const mapa = new Map<string, SaldoParte>();
  for (const m of movs) {
    const actual = mapa.get(m.parteId) ?? {
      parteId: m.parteId,
      parteNombre: m.parteNombre,
      cargos: 0,
      abonos: 0,
      saldo: 0,
      movimientos: 0,
      ultimo: null,
    };
    if (m.tipo === "cargo") actual.cargos += m.monto;
    else actual.abonos += m.monto;
    actual.movimientos += 1;
    // El nombre más reciente gana: si la razón social cambió, se muestra la de hoy.
    if (!actual.ultimo || m.fecha > actual.ultimo) {
      actual.ultimo = m.fecha;
      actual.parteNombre = m.parteNombre;
    }
    mapa.set(m.parteId, actual);
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, cargos: r2(c.cargos), abonos: r2(c.abonos), saldo: r2(c.cargos - c.abonos) }))
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo) || (b.ultimo ?? "").localeCompare(a.ultimo ?? ""));
}

/** Cómo se lee el saldo, en el idioma del patio. */
export function leerSaldo(saldo: number, nombre: string): string {
  if (Math.abs(saldo) < 0.005) return `${nombre} está al día.`;
  return saldo > 0
    ? `${nombre} le debe S/ ${saldo.toFixed(2)} al CTP.`
    : `El CTP le debe S/ ${Math.abs(saldo).toFixed(2)} a ${nombre}.`;
}

/**
 * Corrida de saldos: los movimientos ordenados del más viejo al más nuevo, con
 * el saldo acumulado en cada paso. Es lo que se le muestra a la parte cuando
 * discute el número — un total sin el camino no convence a nadie.
 */
export function corridaDeSaldos(movs: MovimientoCuenta[]): Array<MovimientoCuenta & { acumulado: number }> {
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  let acum = 0;
  return orden.map((m) => {
    acum += m.tipo === "cargo" ? m.monto : -m.monto;
    return { ...m, acumulado: r2(acum) };
  });
}

/**
 * Fletes que todavía no se cargaron a la cuenta de nadie.
 *
 * Sólo los que van **a cargo del proveedor**: los que paga el CTP son su costo,
 * no una deuda de un tercero. Y sólo los que tienen monto — cargar un flete sin
 * precio metería un cero en una cuenta corriente, que es peor que no cargarlo.
 */
export function fletesSinCargar<T extends { id: string; pagaQuien: string; monto: number | null; proveedorId: string | null }>(
  fletes: T[],
  movimientos: MovimientoCuenta[],
): T[] {
  const yaCargados = new Set(movimientos.map((m) => m.fleteId).filter(Boolean));
  return fletes.filter(
    (f) => f.pagaQuien === "proveedor" && f.monto != null && f.monto > 0 && f.proveedorId && !yaCargados.has(f.id),
  );
}
