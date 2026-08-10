/**
 * Piezas compartidas del Historial de Gastos.
 *
 * Están acá y no dentro del tab porque son puras —fechas, formato, CSV— y así
 * se pueden probar sin montar la pantalla. El tab quedó de composición.
 */

import type { ExpenseMeta } from "@/lib/expense-meta";

export type EstadoPago = "pagado" | "parcial" | "pendiente" | "sin_registro";

export type HistorialItem = {
  id: string;
  refId: string;
  source: "expense" | "purchase";
  fecha: string;
  category: string;
  /** Ya viene decodificada del backend: sin el bloque `---META---`. */
  description: string;
  amount: number;
  recurring: boolean;
  estadoPago: EstadoPago;
  montoPagado: number;
  supplierName?: string;
  descuento?: number;
  meta?: ExpenseMeta;
};

export type KpisServidor = {
  totalGastado: number;
  totalPagado: number;
  totalPorPagar: number;
  cantidadGastos: number;
  porCategoria: Record<string, number>;
  porSource: { expense: number; purchase: number };
};

export type Period = "hoy" | "semana" | "mes" | "mes-pasado" | "trimestre" | "anio" | "todo";

export type Orden = {
  campo: "fecha" | "amount" | "category" | "source" | "estadoPago";
  dir: "asc" | "desc";
};

export const PERIOD_LABELS: Record<Period, string> = {
  hoy: "Hoy",
  semana: "7 días",
  mes: "Este mes",
  "mes-pasado": "Mes pasado",
  trimestre: "Trimestre",
  anio: "Este año",
  todo: "Todo",
};

export const ESTADO_PAGO_LABELS: Record<EstadoPago, string> = {
  pagado: "Pagado",
  parcial: "Pago parcial",
  pendiente: "Por pagar",
  sin_registro: "Sin registro de pago",
};

export function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

/** Clave `2026-08` para agrupar, y su etiqueta legible. */
export function mesDe(iso: string): { clave: string; label: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { clave: "—", label: "Sin fecha" };
  const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const label = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return { clave, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

/**
 * Rango de cada período.
 *
 * «Trimestre» era «los últimos 3 meses corridos», que no es un trimestre: si
 * hoy es 10 de agosto devolvía desde el 10 de mayo, a caballo de dos
 * trimestres, y ningún corte contable coincidía. Ahora es el trimestre
 * calendario en curso. Y todos los períodos cerrados declaran su `to`: sin él,
 * «mes pasado» habría traído también lo de este mes.
 */
export function periodoADadas(period: Period, hoy: Date): { from?: Date; to?: Date } {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (period) {
    case "hoy": {
      const from = new Date(y, m, hoy.getDate(), 0, 0, 0, 0);
      return { from, to: new Date(y, m, hoy.getDate(), 23, 59, 59, 999) };
    }
    case "semana": {
      const from = new Date(y, m, hoy.getDate() - 6, 0, 0, 0, 0);
      return { from };
    }
    case "mes":
      return { from: new Date(y, m, 1, 0, 0, 0, 0) };
    case "mes-pasado":
      return {
        from: new Date(y, m - 1, 1, 0, 0, 0, 0),
        to: new Date(y, m, 0, 23, 59, 59, 999),
      };
    case "trimestre":
      return { from: new Date(y, Math.floor(m / 3) * 3, 1, 0, 0, 0, 0) };
    case "anio":
      return { from: new Date(y, 0, 1, 0, 0, 0, 0) };
    default:
      return {};
  }
}

/** Suma lo que se ve, no lo que trajo el servidor: los chips filtran la tabla. */
export function resumirItems(items: HistorialItem[]) {
  let total = 0;
  let pagado = 0;
  let operativos = 0;
  let compras = 0;
  const porCategoria: Record<string, number> = {};
  for (const i of items) {
    total += i.amount;
    pagado += i.montoPagado;
    if (i.source === "expense") operativos += i.amount;
    else compras += i.amount;
    porCategoria[i.category] = (porCategoria[i.category] ?? 0) + i.amount;
  }
  const redondear = (n: number) => Math.round(n * 100) / 100;
  return {
    total: redondear(total),
    pagado: redondear(pagado),
    porPagar: redondear(total - pagado),
    operativos: redondear(operativos),
    compras: redondear(compras),
    cantidad: items.length,
    categorias: Object.entries(porCategoria)
      .map(([cat, t]) => ({ cat, total: redondear(t) }))
      .sort((a, b) => b.total - a.total),
  };
}

/** Texto sin tildes y en minúsculas, para que «Camión» matchee «camion». */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/**
 * Una celda de CSV para Excel en español.
 *
 * El export anterior sólo entrecomillaba la descripción: un proveedor llamado
 * «Distribuidora Pérez, S.A.C.» corría todas las columnas de esa fila una
 * posición y el archivo quedaba ilegible sin que nada avisara.
 */
function celda(v: string | number): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

/** Excel es-PE espera coma decimal; con punto lee «1.234,00» como texto. */
function numero(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * CSV del historial. Separador `;` y BOM: sin el BOM Excel abre las tildes
 * como «GestiÃ³n», y con `,` mete todo en una sola columna en configuración
 * regional peruana.
 */
export function construirCsv(items: HistorialItem[]): string {
  const cabecera = [
    "Fecha", "Origen", "Categoría", "Descripción", "Proveedor",
    "Estado de pago", "Monto", "Pagado", "Por pagar", "Método de pago",
  ];
  const filas = items.map((i) => [
    celda(formatDate(i.fecha)),
    celda(i.source === "expense" ? "Gasto operativo" : "Compra proveedor"),
    celda(i.category),
    celda(i.description),
    celda(i.supplierName ?? ""),
    celda(ESTADO_PAGO_LABELS[i.estadoPago]),
    celda(numero(i.amount)),
    celda(numero(i.montoPagado)),
    celda(numero(i.amount - i.montoPagado)),
    celda(i.meta?.paymentMethod ?? ""),
  ].join(";"));
  const totales = resumirItems(items);
  const pie = [
    celda("TOTAL"), celda(""), celda(""),
    celda(`${totales.cantidad} ${totales.cantidad === 1 ? "movimiento" : "movimientos"}`), celda(""), celda(""),
    celda(numero(totales.total)), celda(numero(totales.pagado)), celda(numero(totales.porPagar)), celda(""),
  ].join(";");
  return `\uFEFF${[cabecera.map(celda).join(";"), ...filas, pie].join("\r\n")}`;
}
