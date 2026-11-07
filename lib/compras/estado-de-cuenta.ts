/**
 * lib/compras/estado-de-cuenta.ts — estado de cuenta con un proveedor a una
 * fecha de corte (auditoría Compras C48, 17-10).
 *
 * Cada cuenta por pagar es un CARGO (el día que se anotó, por lo que vale hoy:
 * los descuentos de una recepción con faltantes ya están restados del monto)
 * y cada pago es un ABONO. El saldo final es cargos − abonos, que es lo mismo
 * que sumar lo que falta de cada cuenta: así se explica por sus componentes.
 *
 * Puro: lo arma la ruta `app/api/payables/estado-cuenta` (el servidor es el
 * que publica la cifra) y se prueba sin base.
 */
import { limaDateKey } from "@/lib/utils";
import { claveDeCuenta, descripcionALaVista } from "./referencia-documento";

export type CuentaParaEstado = {
  id: string;
  description: string;
  purchaseOrderId?: string | null;
  /** Comprobante de la orden vinculada, si lo tiene. */
  documentoDeLaOrden?: string | null;
  amount: number;
  /** Instante ISO en que se anotó la deuda. */
  createdAt: string;
  /** Vencimiento «AAAA-MM-DD». */
  vence: string;
  payments: { id: string; amount: number; method: string; date: string; reference?: string | null }[];
};

export type MovimientoDeCuenta = {
  /** «AAAA-MM-DD» (día de Lima). */
  fecha: string;
  tipo: "cargo" | "abono";
  /** Qué es: el documento de la deuda o el pago con su medio. */
  detalle: string;
  /** La deuda a la que pertenece (el abono lleva la de su cuenta). */
  cuentaId: string;
  cargo: number;
  abono: number;
  /** Saldo acumulado después de este movimiento. */
  saldo: number;
};

export type EstadoDeCuenta = {
  corte: string;
  movimientos: MovimientoDeCuenta[];
  cargos: number;
  abonos: number;
  saldo: number;
  /** Lo vencido al corte (sale de las cuentas con saldo y vencimiento antes del corte). */
  vencido: number;
  /** Cuentas con saldo al corte. */
  abiertas: number;
  /** Cuentas sin documento ni orden: hay que conseguir el papel para conciliarlas. */
  sinDocumento: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const MEDIOS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
};

/** Día de Lima de un instante ISO; vacío si no se puede leer. */
const diaDe = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? limaDateKey(d) : "";
};

export function armarEstadoDeCuenta(cuentas: readonly CuentaParaEstado[], corte: string): EstadoDeCuenta {
  const movs: Omit<MovimientoDeCuenta, "saldo">[] = [];
  let vencido = 0;
  let abiertas = 0;
  let sinDocumento = 0;

  for (const c of cuentas) {
    const desde = diaDe(c.createdAt);
    if (!desde || desde > corte) continue;
    const vista = descripcionALaVista(c.description, c.purchaseOrderId) || "Deuda sin detalle";
    const doc = c.documentoDeLaOrden?.trim();
    const detalle = doc && !vista.includes(doc) ? `${vista} · ${doc}` : vista;
    movs.push({ fecha: desde, tipo: "cargo", detalle, cuentaId: c.id, cargo: r2(num(c.amount)), abono: 0 });
    let pagado = 0;
    for (const p of c.payments) {
      const dia = diaDe(p.date);
      if (!dia || dia > corte) continue;
      pagado += num(p.amount);
      const medio = MEDIOS[p.method] ?? p.method;
      movs.push({
        fecha: dia,
        tipo: "abono",
        detalle: `Pago ${medio.toLowerCase()}${p.reference ? ` · ref. ${p.reference}` : ""} — ${detalle}`,
        cuentaId: c.id,
        cargo: 0,
        abono: r2(num(p.amount)),
      });
    }
    const falta = r2(num(c.amount) - pagado);
    if (falta > 0.004) {
      abiertas++;
      if (c.vence && c.vence < corte) vencido += falta;
    }
    if (!c.purchaseOrderId && !claveDeCuenta(c)) sinDocumento++;
  }

  // Por fecha; el mismo día, el cargo antes que sus abonos.
  movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === b.tipo ? 0 : a.tipo === "cargo" ? -1 : 1));

  let saldo = 0;
  let cargos = 0;
  let abonos = 0;
  const movimientos = movs.map((m) => {
    cargos += m.cargo;
    abonos += m.abono;
    saldo = r2(saldo + m.cargo - m.abono);
    return { ...m, saldo };
  });

  return {
    corte,
    movimientos,
    cargos: r2(cargos),
    abonos: r2(abonos),
    saldo: r2(cargos - abonos),
    vencido: r2(vencido),
    abiertas,
    sinDocumento,
  };
}
