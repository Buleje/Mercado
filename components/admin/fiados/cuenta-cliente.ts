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
import { formatDateLong, formatTime } from "@/lib/format";
import { medioYNota, type MetodoCobro } from "@/lib/fiados/cobro-metodo";
import type { Gestion } from "@/lib/fiados/gestion-cobranza";
import { diaLeido } from "./fechas";
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

/** Cuotas de un mismo cobro: el reparto se escribe en una transacción, una cuota tras otra. */
const VENTANA_DEL_COBRO_MS = 3000;
const ms = (iso: string) => new Date(iso).getTime();

/**
 * Los abonos que salieron del MISMO cobro que `abono` (revisión 17-10).
 *
 * «Cobrar todo lo del cliente» (`/api/fiados/cobrar`) reparte el monto entre
 * sus compras, de la más vieja a la nueva, y deja UNA cuota por compra: un
 * cobro de S/ 60 eran dos abonos y su recibo rehecho salía como dos recibos.
 * Sin una columna que los una (no hay migraciones), se juntan los que
 * comparten medio y nota, caen dentro de 3 s y son de compras DISTINTAS:
 * un mismo cobro toca cada compra una sola vez, así que dos cuotas de la misma
 * compra son siempre dos cobros.
 */
export function cobroDelAbono(abono: AbonoDeCuenta, todos: readonly AbonoDeCuenta[]): AbonoDeCuenta[] {
  const t0 = ms(abono.fecha);
  const porCompra = new Map<string, AbonoDeCuenta>([[abono.fiado.id, abono]]);
  for (const a of todos) {
    if (a.id === abono.id || a.medio !== abono.medio || a.nota !== abono.nota) continue;
    if (Math.abs(ms(a.fecha) - t0) > VENTANA_DEL_COBRO_MS) continue;
    const ya = porCompra.get(a.fiado.id);
    if (ya && (ya.id === abono.id || Math.abs(ms(ya.fecha) - t0) <= Math.abs(ms(a.fecha) - t0))) continue;
    porCompra.set(a.fiado.id, a);
  }
  return [...porCompra.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Lo que el cliente debía en total en un momento: el saldo de hoy de cada
 * compra más lo que abonó después (sin las canceladas ni las fiadas después).
 * `incluido` = el abono justo en `instante` todavía no se descuenta.
 */
function deudaDelClienteEn(compras: readonly Fiado[], instante: number, incluido: boolean): number {
  let total = 0;
  for (const f of compras) {
    if (f.status === "CANCELADO" || ms(f.createdAt) > instante) continue;
    const despues = f.cuotas.filter((c) => (incluido ? ms(fechaDeCuota(c)) >= instante : ms(fechaDeCuota(c)) > instante));
    total += f.saldo + despues.reduce((s, c) => s + c.monto, 0);
  }
  return r2(total);
}

/**
 * El recibo de un abono ya hecho: lo mismo que sale al cobrar, con la fecha y
 * la hora de ese abono. Con `cuenta`, un cobro repartido entre compras sale
 * como UN recibo con la deuda entera del cliente (igual que el que se entregó
 * al cobrar); un abono a una sola compra lleva los saldos y el total de ESA
 * compra, aunque en la ficha esté abierta otra.
 */
export function reciboDeAbono(
  abono: AbonoDeCuenta,
  cliente: { nombre: string; telefono: string },
  cuenta?: { abonos: readonly AbonoDeCuenta[]; compras: readonly Fiado[] },
): ReciboData {
  const comun = {
    clienteNombre: cliente.nombre,
    clientePhone: cliente.telefono,
    fecha: formatDateLong(new Date(abono.fecha)),
    hora: formatTime(abono.fecha),
    metodo: abono.metodo ?? undefined,
  };
  const cobro = cuenta ? cobroDelAbono(abono, cuenta.abonos) : [abono];
  if (cuenta && cobro.length > 1) {
    const desde = ms(cobro[0].fecha);
    const hasta = ms(cobro[cobro.length - 1].fecha);
    return {
      ...comun,
      montoPagado: r2(cobro.reduce((s, a) => s + a.monto, 0)),
      saldoAnterior: deudaDelClienteEn(cuenta.compras, desde, true),
      saldoActual: deudaDelClienteEn(cuenta.compras, hasta, false),
      alcance: "cliente",
      compras: cobro.length,
    };
  }
  return {
    ...comun,
    montoPagado: abono.monto,
    saldoAnterior: abono.saldoAntes,
    saldoActual: abono.saldoDespues,
    alcance: "compra",
    deudaOriginal: abono.fiado.total,
    compraDel: diaLeido(abono.fiado.createdAt),
  };
}
