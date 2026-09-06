/**
 * La cuenta corriente de una persona: qué sacó, qué entregó, cómo quedó.
 *
 * Estaba armada adentro de un modal, así que no se podía probar sin montar
 * React — y es la única pantalla del módulo que se le manda POR WHATSAPP a la
 * persona: si el saldo corrido está mal, el error sale del sistema y llega al
 * teléfono de alguien.
 */

import type { DbAdelanto } from "@/lib/db/adelantos.db";

export type MovimientoCuenta = {
  fecha: string;
  concepto: string;
  /** Positivo = plata que salió del negocio; negativo = lo que la persona entregó. */
  monto: number;
  /** Saldo corrido DESPUÉS de este movimiento — de la MISMA moneda que `moneda`, nunca mezclado. */
  saldo: number;
  /** PEN si no viene — mismo default que el resto del módulo (shared.tsx). */
  moneda: string;
};

/**
 * Los movimientos en orden cronológico, con el saldo corriendo.
 *
 * El saldo corre POR MONEDA: un acumulador por cada una, no uno solo. Antes
 * un adelanto en soles y otro en dólares se sumaban al mismo `acumulado`
 * como si fueran la misma plata (auditoría de esta sesión) — y esta es la
 * ÚNICA pantalla del módulo que se le manda por WhatsApp a la persona, así
 * que el número mal calculado salía del sistema y llegaba a su teléfono.
 *
 * Los CANCELADOS quedan afuera: no se cobran, y verlos en la cuenta que se le
 * manda a la persona la haría discutir una deuda que el negocio ya perdonó.
 */
export function movimientosDePersona(adelantos: readonly DbAdelanto[]): MovimientoCuenta[] {
  const sueltos: { fecha: string; concepto: string; monto: number; moneda: string }[] = [];

  for (const a of adelantos) {
    if (a.status === "CANCELADO") continue;
    const moneda = a.moneda || "PEN";
    sueltos.push({
      fecha: a.fechaAdelanto,
      concepto: `Adelanto ${a.codigoOperacion ?? ""}`.trim(),
      monto: a.montoAdelantado,
      moneda,
    });
    for (const e of a.entregas) {
      sueltos.push({ fecha: e.fecha, concepto: e.descripcion || "Entrega", monto: -e.valor, moneda });
    }
  }

  sueltos.sort((x, y) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime());

  const acumulados: Record<string, number> = {};
  return sueltos.map((m) => {
    /* Se redondea en CADA paso: arrastrar la cola binaria hace que el último
       saldo termine en 0.30000000000000004 y el papel deje de cuadrar. */
    const nuevo = Math.round(((acumulados[m.moneda] ?? 0) + m.monto) * 100) / 100;
    acumulados[m.moneda] = nuevo;
    return { ...m, saldo: nuevo };
  });
}

/** El saldo final de la cuenta, por moneda — el último corrido de cada una. */
export function saldoDeLaCuenta(movimientos: readonly MovimientoCuenta[]): Record<string, number> {
  const saldos: Record<string, number> = {};
  // Vienen en orden cronológico: el último de cada moneda es el que queda.
  for (const m of movimientos) saldos[m.moneda] = m.saldo;
  return saldos;
}

const money = (n: number, moneda: string) =>
  moneda === "USD"
    ? `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });

/** El mismo estado de cuenta, escrito para pegarlo en un WhatsApp. */
export function textoEstadoDeCuenta(nombre: string, movimientos: readonly MovimientoCuenta[]): string {
  const lineas = movimientos
    .map((m) => `${dia(m.fecha)} · ${m.concepto}: ${m.monto >= 0 ? "+" : "−"}${money(Math.abs(m.monto), m.moneda)}`)
    .join("\n");
  const raya = "━━━━━━━━━━━━━━━━━━━";
  const saldoTexto = Object.entries(saldoDeLaCuenta(movimientos))
    .map(([moneda, v]) => money(v, moneda))
    .join(" · ");
  return `*Estado de cuenta*\n${nombre}\n${raya}\n${lineas}\n${raya}\n*Saldo pendiente: ${saldoTexto}*`;
}
