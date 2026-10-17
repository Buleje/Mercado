/**
 * lib/caja/cobros-para-revisar.ts — cobros por Yape, Plin, tarjeta o banco que
 * conviene mirar antes de dar la conciliación por buena (auditoría 15-10, M29).
 *
 * «Conciliación digital» comparaba sólo TOTALES (caja vs. saldo de la app): un
 * Yape anotado dos veces y otro que faltaba se compensaban y salía «Cuadra
 * perfecto». Esto marca lo repetido para que una persona lo revise; nunca se
 * borra ni se descuenta solo, y el monto igual por sí solo NO cuenta (dos
 * vecinos pagan S/ 3.50 por Yape al mismo minuto todos los días):
 *
 *  - la MISMA venta (`saleId`) entró más de una vez a la caja;
 *  - dos ingresos a mano por el mismo medio, mismo monto y misma descripción
 *    dentro de 30 min (lo que deja un doble clic o un reintento).
 *
 * Sólo medios que no son efectivo: el efectivo se revisa contando el cajón.
 * PURO y client-safe.
 */
import { medioDeMovimiento } from "@/lib/caja/saldo-esperado";

export interface MovimientoParaRevisar {
  id: string;
  type: string;
  amount: number;
  method?: string | null;
  description?: string | null;
  saleId?: string | null;
  createdAt: string;
}

export interface CobroParaRevisar {
  clave: string;
  motivo: "misma-venta" | "ingreso-repetido";
  medio: string;
  monto: number;
  /** Del más viejo al más nuevo. */
  movimientos: MovimientoParaRevisar[];
}

const VENTANA_INGRESO_MS = 30 * 60_000;
const centimos = (n: number) => Math.round(n * 100);

export function cobrosDigitalesParaRevisar(movimientos: ReadonlyArray<MovimientoParaRevisar>, medio?: string): CobroParaRevisar[] {
  const digitales = movimientos
    .filter((m) => (m.type === "venta" || m.type === "ingreso") && medioDeMovimiento(m.method) !== "efectivo")
    .filter((m) => !medio || medioDeMovimiento(m.method) === medio)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out: CobroParaRevisar[] = [];

  const porVenta = new Map<string, MovimientoParaRevisar[]>();
  for (const m of digitales) {
    if (m.type !== "venta" || !m.saleId) continue;
    porVenta.set(m.saleId, [...(porVenta.get(m.saleId) ?? []), m]);
  }
  for (const [saleId, grupo] of porVenta) {
    if (grupo.length < 2) continue;
    out.push({ clave: `venta:${saleId}`, motivo: "misma-venta", medio: medioDeMovimiento(grupo[0].method), monto: grupo[0].amount, movimientos: grupo });
  }

  const ingresos = digitales.filter((m) => m.type === "ingreso" && !m.saleId);
  const usados = new Set<string>();
  for (const m of ingresos) {
    if (usados.has(m.id)) continue;
    const t0 = new Date(m.createdAt).getTime();
    const gemelos = ingresos.filter(
      (o) =>
        o.id !== m.id &&
        !usados.has(o.id) &&
        medioDeMovimiento(o.method) === medioDeMovimiento(m.method) &&
        centimos(o.amount) === centimos(m.amount) &&
        (o.description ?? "").trim().toLowerCase() === (m.description ?? "").trim().toLowerCase() &&
        Math.abs(new Date(o.createdAt).getTime() - t0) <= VENTANA_INGRESO_MS,
    );
    if (gemelos.length === 0) continue;
    const grupo = [m, ...gemelos];
    for (const g of grupo) usados.add(g.id);
    out.push({ clave: `ingreso:${m.id}`, motivo: "ingreso-repetido", medio: medioDeMovimiento(m.method), monto: m.amount, movimientos: grupo });
  }

  return out.sort((a, b) => a.movimientos[0].createdAt.localeCompare(b.movimientos[0].createdAt));
}
