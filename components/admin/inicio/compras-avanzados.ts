import type { WaterfallStep } from "@/components/ui-system/charts";
import { fechaCorta, partesDeFecha } from "@/lib/admin/inicio/formato-tablero";
import { participacion } from "./compras-presentacion";

/**
 * Series de los gráficos opcionales de Compras (`ComprasAdvancedCharts`).
 * Mismas cuentas que antes vivían dentro del componente (2026-10-09 se
 * sacaron para que el componente quede en ~250 líneas y se puedan probar);
 * `ahora` entra como parámetro en vez de leer el reloj adentro.
 */

export type CompraCruda = { supplierName?: string; total: number; createdAt?: string };
export type CuentaCruda = {
  amount: number;
  paidAmount?: number;
  status?: string;
  dueDate?: string;
  createdAt?: string;
};

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
/** Colores del mix por proveedor (claves de la paleta de gráficos). */
const PROV_COLOR_KEYS = ["purple", "info", "secondary", "tertiary", "amber"] as const;

const corto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const ms = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

/** Pareto de proveedores de los últimos 30 días: parte de cada uno y acumulado, en %. */
export function paretoDeProveedores(compras: readonly CompraCruda[], ahora: number) {
  const desde = ahora - 30 * DIA_MS;
  const m = new Map<string, number>();
  for (const p of compras) {
    if (!(ms(p.createdAt) >= desde)) continue;
    const k = p.supplierName ?? "Sin proveedor";
    m.set(k, (m.get(k) ?? 0) + Number(p.total ?? 0));
  }
  const ordenados = [...m.entries()].sort(([, a], [, b]) => b - a);
  const total = ordenados.reduce((s, [, v]) => s + v, 0);
  let acc = 0;
  const rows = ordenados.slice(0, 15).map(([prov, monto]) => {
    acc += monto;
    return {
      proveedor: corto(prov, 14),
      monto: Math.round(monto),
      parte: Math.round(participacion(monto, total) * 10) / 10,
      acumuladoPct: total > 0 ? Math.round((acc / total) * 1000) / 10 : 0,
    };
  });
  const i80 = rows.findIndex((r) => r.acumuladoPct >= 80);
  return { rows, total: Math.round(total), provsFor80: i80 >= 0 ? i80 + 1 : rows.length, totalProvs: ordenados.length };
}

/** Cuentas por pagar abiertas: vencidas, que vencen en 7 días y al día (más de 7). */
export function saludDeCuentas(cuentas: readonly CuentaCruda[], ahora: number) {
  const abiertas = cuentas.filter((p) => p.status !== "pagado");
  if (abiertas.length === 0) return { pct: 100, ok: 0, urgente: 0, vencidas: 0, total: 0 };
  const vencidas = abiertas.filter((p) => ms(p.dueDate) < ahora).length;
  const urgente = abiertas.filter((p) => {
    const t = ms(p.dueDate);
    return t >= ahora && t < ahora + 7 * DIA_MS;
  }).length;
  const ok = abiertas.length - vencidas - urgente;
  return { pct: Math.round((ok / abiertas.length) * 100), ok, urgente, vencidas, total: abiertas.length };
}

/** Compras de los últimos 14 días, por día, partidas por los 5 proveedores principales. */
export function mixPorProveedor(compras: readonly CompraCruda[], ahora: number) {
  const desde = ahora - 14 * DIA_MS;
  const porDia = new Map<string, Map<string, number>>();
  for (const p of compras) {
    if (!(ms(p.createdAt) >= desde)) continue;
    const f = partesDeFecha(p.createdAt);
    if (!f) continue;
    const k = `${f.anio}-${String(f.mes).padStart(2, "0")}-${String(f.dia).padStart(2, "0")}`;
    const dia = porDia.get(k) ?? new Map<string, number>();
    const prov = p.supplierName ?? "Sin proveedor";
    dia.set(prov, (dia.get(prov) ?? 0) + Number(p.total ?? 0));
    porDia.set(k, dia);
  }
  const totales = new Map<string, number>();
  porDia.forEach((dia) => dia.forEach((v, prov) => totales.set(prov, (totales.get(prov) ?? 0) + v)));
  const topProvs = [...totales.entries()].sort(([, a], [, b]) => b - a).slice(0, 5).map(([p]) => p);
  const rows = [...porDia.keys()].sort().map((k) => {
    const dia = porDia.get(k) ?? new Map<string, number>();
    const row: Record<string, string | number> = { day: fechaCorta(k) };
    for (const prov of topProvs) row[prov] = Math.round(dia.get(prov) ?? 0);
    return row;
  });
  const stacks = topProvs.map((prov, i) => ({
    key: prov,
    label: corto(prov, 18),
    color: PROV_COLOR_KEYS[i % PROV_COLOR_KEYS.length],
  }));
  return { rows, stacks, topProvs };
}

/**
 * Cascada de la deuda en 30 días. El punto de partida es ESTIMADO: deuda de
 * hoy − cuentas creadas en 30 días + lo ya pagado de esas cuentas.
 */
export function cascadaDeDeuda(cuentas: readonly CuentaCruda[], ahora: number) {
  const desde = ahora - 30 * DIA_MS;
  const deudaActual = cuentas
    .filter((p) => p.status !== "pagado")
    .reduce((s, p) => s + (Number(p.amount ?? 0) - Number(p.paidAmount ?? 0)), 0);
  const nuevas = cuentas.filter((p) => ms(p.createdAt) >= desde);
  const nuevaDeuda = nuevas.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const pagado = nuevas.reduce((s, p) => s + Number(p.paidAmount ?? 0), 0);
  const deudaInicio = Math.max(0, deudaActual - nuevaDeuda + pagado);
  const steps: WaterfallStep[] = [
    // Rótulos ≤ 9 letras: el gráfico da 72 u por barra y los largos se pisaban.
    { label: "Hace 30 d", value: Math.round(deudaInicio), type: "baseline" },
    { label: "Nuevas", value: Math.round(nuevaDeuda), type: "positive" },
    { label: "Pagado", value: -Math.round(pagado), type: "negative" },
    { label: "Hoy", value: Math.round(deudaActual), type: "total" },
  ];
  return { steps, deudaActual, nuevaDeuda, pagado };
}

/** Los últimos 7 días contra los 7 anteriores, día por día (Lun, Mar…). */
export function semanaContraAnterior(compras: readonly CompraCruda[], ahora: number) {
  const filas = Array.from({ length: 7 }, () => ({ day: "", current: 0, previous: 0 }));
  const inicioActual = ahora - 7 * DIA_MS;
  const inicioAnterior = ahora - 14 * DIA_MS;
  for (const p of compras) {
    const t = ms(p.createdAt);
    if (!(t >= inicioAnterior)) continue;
    const actual = t >= inicioActual;
    const atras = Math.floor(((actual ? ahora : inicioActual) - t) / DIA_MS);
    if (atras < 0 || atras >= 7) continue;
    filas[6 - atras][actual ? "current" : "previous"] += Number(p.total ?? 0);
  }
  filas.forEach((r, i) => {
    const d = new Date(ahora);
    d.setDate(d.getDate() - (6 - i));
    r.day = DIAS_SEMANA[d.getDay()];
    r.current = Math.round(r.current);
    r.previous = Math.round(r.previous);
  });
  const suma = (k: "current" | "previous") => filas.reduce((s, b) => s + b[k], 0);
  return { rows: filas, actual: suma("current"), anterior: suma("previous") };
}
