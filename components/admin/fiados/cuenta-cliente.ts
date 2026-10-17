/**
 * La cuenta completa de un cliente en la ficha lateral de «Me deben» (M32,
 * 17-10): todas sus compras fiadas, todos sus abonos y sus gestiones, sin
 * salir de la lista de cobranza.
 *
 * El saldo de cada abono se reconstruye HACIA ATRÁS desde el saldo que publica
 * el servidor (`fiado.saldo`): el abono más reciente deja el saldo de hoy y
 * cada uno anterior suma el monto del siguiente. Ningún saldo se recalcula
 * desde el total: si las cuotas no cuadran con él, el saldo de hoy sigue
 * siendo el del servidor y el recibo de un abono viejo es un derivado.
 */
import { formatDateLong } from "@/lib/format";
import { medioYNota, type MetodoCobro } from "@/lib/fiados/cobro-metodo";
import type { Gestion } from "@/lib/fiados/gestion-cobranza";
import { estaAbierto, type Fiado, type FiadoCuota, type ReciboData } from "./tipos";

export interface AbonoDeCuenta {
  id: string;
  fecha: string;
  monto: number;
  metodo: MetodoCobro | null;
  /** «Yape», «Efectivo»… null en los cobros viejos que no lo anotaron. */
  medio: string | null;
  nota: string;
  fiado: Fiado;
  saldoAntes: number;
  saldoDespues: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fechaDeCuota = (c: FiadoCuota) => c.pagadoEn ?? c.createdAt;

/** Sus compras fiadas: las que debe primero (la más vieja arriba), después las pagadas (la más nueva arriba). */
export function comprasDelCliente(fiados: readonly Fiado[], customerId: string): Fiado[] {
  const suyas = fiados.filter((f) => f.customerId === customerId);
  const abiertas = suyas.filter(estaAbierto).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const cerradas = suyas.filter((f) => !estaAbierto(f)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...abiertas, ...cerradas];
}

/** Todos sus abonos, del más reciente al más viejo, con el saldo de esa compra antes y después. */
export function abonosDelCliente(fiados: readonly Fiado[], customerId: string): AbonoDeCuenta[] {
  const out: AbonoDeCuenta[] = [];
  for (const f of fiados) {
    if (f.customerId !== customerId) continue;
    const recientesPrimero = [...f.cuotas].sort((a, b) => fechaDeCuota(b).localeCompare(fechaDeCuota(a)) || b.createdAt.localeCompare(a.createdAt));
    let despues = r2(f.saldo);
    for (const c of recientesPrimero) {
      const antes = r2(despues + c.monto);
      out.push({ id: c.id, fecha: fechaDeCuota(c), monto: c.monto, ...medioYNota(c.notas), fiado: f, saldoAntes: antes, saldoDespues: despues });
      despues = antes;
    }
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Sus gestiones de cobranza (llamadas, visitas, promesas), la más reciente arriba. */
export function gestionesDelCliente(gestiones: readonly Gestion[], customerId: string): Gestion[] {
  return gestiones.filter((g) => g.customerId === customerId).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** El recibo de un abono ya hecho: lo mismo que sale al cobrar, con la fecha de ese abono. */
export function reciboDeAbono(abono: AbonoDeCuenta, cliente: { nombre: string; telefono: string }): ReciboData {
  return {
    clienteNombre: cliente.nombre,
    clientePhone: cliente.telefono,
    montoPagado: abono.monto,
    saldoAnterior: abono.saldoAntes,
    saldoActual: abono.saldoDespues,
    fecha: formatDateLong(new Date(abono.fecha)),
    metodo: abono.metodo ?? undefined,
  };
}
