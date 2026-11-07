/**
 * ficha-proveedor.ts — lo que la ficha de consulta de un proveedor muestra de
 * un vistazo (C33/C39, noche 17-10): cuánto le debes, cuánto le compraste,
 * qué está en camino y qué devolución sigue abierta. Los totales salen acá,
 * en el servidor; la pantalla sólo los dibuja.
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { claveDeDia, esperaEntrega } from "./ciclo-oc";

export interface OrdenDeFicha {
  id: string;
  /** pendiente | recibido | parcial | cancelado | auto_generated */
  estado: string;
  total: number;
  creada: string;
  prometida: string | null;
  recibida: string | null;
  /** «Factura F001-123» o `null` si no se anotó comprobante. */
  comprobante: string | null;
}

export interface CuentaDeFicha {
  id: string;
  ordenId: string | null;
  descripcion: string;
  monto: number;
  pagado: number;
  saldo: number;
  estado: string;
  vence: string;
}

export interface DevolucionDeFicha {
  id: string;
  motivo: string;
  /** PENDIENTE | ENVIADA | RESUELTA | ANULADA */
  estado: string;
  creada: string;
  items: number;
  /** Lo que se le reclama (cantidad × costo al registrar); `null` si ninguna línea tiene costo. */
  monto: number | null;
}

export interface RecepcionDeFicha {
  id: string;
  ref: string;
  estado: string;
  fecha: string | null;
  ordenId: string | null;
}

export interface ResumenFicha {
  saldo: number;
  vencido: number;
  cuentasAbiertas: number;
  /** Total de las órdenes que llegaron (enteras o a medias) en los últimos 12 meses. */
  compradoEnElAnio: number;
  ordenesEnElAnio: number;
  /** YYYY-MM-DD de la última orden no anulada. */
  ultimaCompra: string | null;
  /** Órdenes pedidas que todavía no llegan enteras (pendientes o a medias). */
  enCamino: number;
  devolucionesAbiertas: number;
  montoDevolucionesAbiertas: number;
}

export interface FichaDeProveedor {
  resumen: ResumenFicha;
  ordenes: OrdenDeFicha[];
  cuentas: CuentaDeFicha[];
  devoluciones: DevolucionDeFicha[];
  recepciones: RecepcionDeFicha[];
}

const LLEGARON = new Set(["recibido", "parcial"]);
const DEVOLUCION_ABIERTA = new Set(["PENDIENTE", "ENVIADA"]);

const redondear = (n: number) => Math.round(n * 100) / 100;

/** «Factura F001-123» con lo que se anotó en la orden. */
export function comprobanteDeOrden(tipo: string | null | undefined, numero: string | null | undefined): string | null {
  const n = (numero ?? "").trim();
  if (!n) return null;
  const t = (tipo ?? "").trim();
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)} ${n}` : n;
}

export function resumirFicha(
  datos: Pick<FichaDeProveedor, "ordenes" | "cuentas" | "devoluciones">,
  hoy: string,
): ResumenFicha {
  const haceUnAnio = (() => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const abiertas = datos.cuentas.filter((c) => c.estado !== "pagado" && c.saldo > 0.005);
  const saldo = abiertas.reduce((s, c) => s + c.saldo, 0);
  const vencido = abiertas.filter((c) => (claveDeDia(c.vence) ?? hoy) < hoy).reduce((s, c) => s + c.saldo, 0);

  const validas = datos.ordenes.filter((o) => o.estado !== "cancelado" && o.estado !== "auto_generated");
  const delAnio = validas.filter((o) => LLEGARON.has(o.estado) && (claveDeDia(o.creada) ?? "") >= haceUnAnio);
  const ultima = validas.map((o) => claveDeDia(o.creada)).filter((k): k is string => k !== null).sort().pop() ?? null;

  const devAbiertas = datos.devoluciones.filter((d) => DEVOLUCION_ABIERTA.has(d.estado));

  return {
    saldo: redondear(saldo),
    vencido: redondear(vencido),
    cuentasAbiertas: abiertas.length,
    compradoEnElAnio: redondear(delAnio.reduce((s, o) => s + o.total, 0)),
    ordenesEnElAnio: delAnio.length,
    ultimaCompra: ultima,
    enCamino: validas.filter((o) => esperaEntrega(o.estado)).length,
    devolucionesAbiertas: devAbiertas.length,
    montoDevolucionesAbiertas: redondear(devAbiertas.reduce((s, d) => s + (d.monto ?? 0), 0)),
  };
}
