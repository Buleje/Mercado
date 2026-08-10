/**
 * Piezas compartidas del Historial de Gastos.
 *
 * Están acá y no dentro del tab porque son puras —fechas, formato, CSV— y así
 * se pueden probar sin montar la pantalla. El tab quedó de composición.
 */

import type { ExpenseMeta } from "@/lib/expense-meta";

export type EstadoPago = "pagado" | "parcial" | "pendiente" | "sin_registro";

export type FuenteHistorial = "expense" | "purchase" | "flete" | "adelanto" | "caja";

/**
 * No todo lo que sale de la caja es un gasto:
 *  · `gasto`    — se fue y no vuelve. Es lo único que suma a «Total gastado».
 *  · `anticipo` — el adelanto al personal vuelve como trabajo o producto.
 *  · `caja`     — retiro manual; suele ser la otra cara de un gasto ya cargado.
 */
export type ClaseMovimiento = "gasto" | "anticipo" | "caja";

export type HistorialItem = {
  id: string;
  refId: string;
  source: FuenteHistorial;
  clase: ClaseMovimiento;
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
  /** Código del movimiento que este ya duplica (ej. el adelanto que lo originó). */
  duplicaDe?: string;
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

export const ORIGEN_LABELS: Record<FuenteHistorial, string> = {
  expense: "Gasto operativo",
  purchase: "Compra a proveedor",
  flete: "Flete",
  adelanto: "Adelanto al personal",
  caja: "Retiro de caja",
};

export const CLASE_LABELS: Record<ClaseMovimiento, string> = {
  gasto: "Gasto",
  anticipo: "Anticipo (vuelve)",
  caja: "Retiro de caja (fuera del total)",
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

/**
 * Suma lo que se ve, no lo que trajo el servidor: los chips filtran la tabla.
 *
 * `total` cuenta SÓLO la clase `gasto`. Los anticipos y los retiros de caja
 * llevan su propia línea — un adelanto al personal sale de la caja pero es un
 * derecho a cobrar, y un retiro suele ser la otra cara de un gasto ya cargado.
 */
export function resumirItems(items: HistorialItem[]) {
  let total = 0;
  let pagado = 0;
  let operativos = 0;
  let compras = 0;
  let fletes = 0;
  let anticipos = 0;
  let retirosCaja = 0;
  const porCategoria: Record<string, number> = {};
  for (const i of items) {
    if (i.clase === "anticipo") { anticipos += i.amount; continue; }
    if (i.clase === "caja") { retirosCaja += i.amount; continue; }
    total += i.amount;
    pagado += i.montoPagado;
    if (i.source === "expense") operativos += i.amount;
    else if (i.source === "flete") fletes += i.amount;
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
    fletes: redondear(fletes),
    anticipos: redondear(anticipos),
    retirosCaja: redondear(retirosCaja),
    /** Sólo los movimientos que cuentan como gasto. */
    cantidad: items.filter((i) => i.clase === "gasto").length,
    cantidadTotal: items.length,
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
    "Fecha", "Origen", "Cuenta como", "Categoría", "Descripción", "Proveedor",
    "Estado de pago", "Monto", "Pagado", "Por pagar", "Método de pago",
  ];
  const filas = items.map((i) => [
    celda(formatDate(i.fecha)),
    celda(ORIGEN_LABELS[i.source]),
    celda(CLASE_LABELS[i.clase]),
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
  // El total del pie es de GASTOS. Los anticipos y retiros van en su propia
  // fila para que quien abra el archivo no los sume sin querer.
  const pie = [
    celda("TOTAL GASTOS"), celda(""), celda(""), celda(""),
    celda(`${totales.cantidad} ${totales.cantidad === 1 ? "movimiento" : "movimientos"}`), celda(""), celda(""),
    celda(numero(totales.total)), celda(numero(totales.pagado)), celda(numero(totales.porPagar)), celda(""),
  ].join(";");
  const pieAparte = [
    celda("NO CUENTAN COMO GASTO"), celda(""), celda(""), celda(""),
    celda("Adelantos (vuelven) + retiros de caja"), celda(""), celda(""),
    celda(numero(totales.anticipos + totales.retirosCaja)), celda(""), celda(""), celda(""),
  ].join(";");
  const lineas = [cabecera.map(celda).join(";"), ...filas, pie];
  if (totales.anticipos + totales.retirosCaja > 0) lineas.push(pieAparte);
  return `\uFEFF${lineas.join("\r\n")}`;
}
