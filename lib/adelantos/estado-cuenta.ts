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
  /** Saldo corrido DESPUÉS de este movimiento. */
  saldo: number;
};

/**
 * Los movimientos en orden cronológico, con el saldo corriendo.
 *
 * Los CANCELADOS quedan afuera: no se cobran, y verlos en la cuenta que se le
 * manda a la persona la haría discutir una deuda que el negocio ya perdonó.
 */
export function movimientosDePersona(adelantos: readonly DbAdelanto[]): MovimientoCuenta[] {
  const sueltos: { fecha: string; concepto: string; monto: number }[] = [];

  for (const a of adelantos) {
    if (a.status === "CANCELADO") continue;
    sueltos.push({
      fecha: a.fechaAdelanto,
      concepto: `Adelanto ${a.codigoOperacion ?? ""}`.trim(),
      monto: a.montoAdelantado,
    });
    for (const e of a.entregas) {
      sueltos.push({ fecha: e.fecha, concepto: e.descripcion || "Entrega", monto: -e.valor });
    }
  }

  sueltos.sort((x, y) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime());

  let acumulado = 0;
  return sueltos.map((m) => {
    /* Se redondea en CADA paso: arrastrar la cola binaria hace que el último
       saldo termine en 0.30000000000000004 y el papel deje de cuadrar. */
    acumulado = Math.round((acumulado + m.monto) * 100) / 100;
    return { ...m, saldo: acumulado };
  });
}

/** El saldo final de la cuenta: el último corrido, o 0 si no hubo movimientos. */
export function saldoDeLaCuenta(movimientos: readonly MovimientoCuenta[]): number {
  return movimientos.length ? movimientos[movimientos.length - 1].saldo : 0;
}

const money = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });

/** El mismo estado de cuenta, escrito para pegarlo en un WhatsApp. */
export function textoEstadoDeCuenta(nombre: string, movimientos: readonly MovimientoCuenta[]): string {
  const lineas = movimientos
    .map((m) => `${dia(m.fecha)} · ${m.concepto}: ${m.monto >= 0 ? "+" : "−"}${money(Math.abs(m.monto))}`)
    .join("\n");
  const raya = "━━━━━━━━━━━━━━━━━━━";
  return `*Estado de cuenta*\n${nombre}\n${raya}\n${lineas}\n${raya}\n*Saldo pendiente: ${money(saldoDeLaCuenta(movimientos))}*`;
}
