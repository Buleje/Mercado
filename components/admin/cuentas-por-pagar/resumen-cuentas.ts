/**
 * resumen-cuentas.ts — lo que la vista «Por pagar» necesita saber de cada cuenta
 * (cuánto falta, cuándo vence, si ya venció) sin repetir la cuenta en cada
 * pieza. Puro: se prueba sin navegador.
 *
 * Los totales que muestra la vista son la suma de lo que el servidor ya guardó
 * (`amount`, `paidAmount`); acá no se recalcula ningún pago.
 */
import { limaDateKey } from "@/lib/utils";

export type CuentaPorPagar = {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId?: string;
  description: string;
  amount: number;
  paidAmount: number;
  status: "pendiente" | "parcial" | "pagado";
  dueDate: string;
  payments: { id: string; amount: number; method: string; date: string; reference?: string }[];
  createdAt: string;
};

export type FiltroEstado = "pendientes" | "pagadas" | "todas";
export type TonoVence = "vencida" | "pronto" | "al-dia" | "pagada";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** «Vence pronto» = dentro de esta cantidad de días. */
export const DIAS_PRONTO = 7;

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export const saldo = (c: Pick<CuentaPorPagar, "amount" | "paidAmount">) => Math.max(0, r2(num(c.amount) - num(c.paidAmount)));
export const estaPagada = (c: Pick<CuentaPorPagar, "amount" | "paidAmount" | "status">) => c.status === "pagado" || saldo(c) <= 0.004;

/**
 * Día del vencimiento como «AAAA-MM-DD». Las cuentas cargadas a mano guardan la
 * fecha del calendario como medianoche UTC (en Lima sería el día anterior a las
 * 19:00); las que nacen de una OC guardan la hora en que se creó. La primera se
 * lee en UTC y la segunda en hora de Lima.
 */
export function diaDeVencimiento(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const medianocheUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return medianocheUtc ? d.toISOString().slice(0, 10) : limaDateKey(d);
}

/** Días entre dos claves «AAAA-MM-DD» (positivo = falta, negativo = pasó). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** «jueves 10/09». */
export function fechaConDia(clave: string): string {
  if (!clave) return "—";
  const d = new Date(`${clave}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${clave.slice(8, 10)}/${clave.slice(5, 7)}`;
}

export function vencimiento(c: CuentaPorPagar, hoy: string): { tono: TonoVence; texto: string; dias: number } {
  const dia = diaDeVencimiento(c.dueDate);
  const dias = dia ? diasEntre(hoy, dia) : 0;
  if (estaPagada(c)) return { tono: "pagada", texto: "Pagada", dias };
  if (dias < 0) return { tono: "vencida", texto: dias === -1 ? "Venció ayer" : `Venció hace ${-dias} días`, dias };
  if (dias === 0) return { tono: "pronto", texto: "Vence hoy", dias };
  if (dias <= DIAS_PRONTO) return { tono: "pronto", texto: dias === 1 ? "Vence mañana" : `Vence en ${dias} días`, dias };
  return { tono: "al-dia", texto: `En ${dias} días`, dias };
}

export type ResumenCuentas = {
  porPagar: number;
  pendientes: number;
  vencido: number;
  vencidas: number;
  pronto: number;
  prontoN: number;
  pagado: number;
};

export function resumir(cuentas: CuentaPorPagar[], hoy: string): ResumenCuentas {
  const r: ResumenCuentas = { porPagar: 0, pendientes: 0, vencido: 0, vencidas: 0, pronto: 0, prontoN: 0, pagado: 0 };
  for (const c of cuentas) {
    r.pagado += num(c.paidAmount);
    if (estaPagada(c)) continue;
    const s = saldo(c);
    r.porPagar += s;
    r.pendientes++;
    const v = vencimiento(c, hoy);
    if (v.tono === "vencida") { r.vencido += s; r.vencidas++; }
    else if (v.tono === "pronto") { r.pronto += s; r.prontoN++; }
  }
  return { ...r, porPagar: r2(r.porPagar), vencido: r2(r.vencido), pronto: r2(r.pronto), pagado: r2(r.pagado) };
}

/** Lo que falta pagar primero: vencidas y próximas arriba; pagadas al final, la más reciente primero. */
export function ordenar(cuentas: CuentaPorPagar[]): CuentaPorPagar[] {
  return [...cuentas].sort((a, b) => {
    const pa = estaPagada(a), pb = estaPagada(b);
    if (pa !== pb) return pa ? 1 : -1;
    const da = diaDeVencimiento(a.dueDate), db = diaDeVencimiento(b.dueDate);
    return pa ? db.localeCompare(da) : da.localeCompare(db);
  });
}

export function filtrar(cuentas: CuentaPorPagar[], estado: FiltroEstado, proveedorId: string): CuentaPorPagar[] {
  return cuentas.filter((c) =>
    (!proveedorId || c.supplierId === proveedorId) &&
    (estado === "todas" || (estado === "pagadas" ? estaPagada(c) : !estaPagada(c))));
}

/** Proveedores con cuentas, el que más se le debe primero (para el filtro). */
export function proveedoresConCuentas(cuentas: CuentaPorPagar[]): { id: string; nombre: string; debe: number; n: number }[] {
  const m = new Map<string, { id: string; nombre: string; debe: number; n: number }>();
  for (const c of cuentas) {
    const p = m.get(c.supplierId) ?? { id: c.supplierId, nombre: c.supplierName || "Sin nombre", debe: 0, n: 0 };
    p.debe = r2(p.debe + saldo(c));
    p.n++;
    m.set(c.supplierId, p);
  }
  return [...m.values()].sort((a, b) => b.debe - a.debe || a.nombre.localeCompare(b.nombre));
}
