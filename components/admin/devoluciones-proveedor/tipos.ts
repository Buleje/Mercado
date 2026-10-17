/**
 * Tipos, etiquetas y cuentas de Devoluciones a proveedores.
 * Sin React: lo usan el hook de datos, la lista, los indicadores y el CSV.
 */
import { formatCurrency } from "@/lib/format";

export type DevolucionEstado = "PENDIENTE" | "ENVIADA" | "RESUELTA";

export interface ItemDevuelto {
  nombre: string;
  cantidad: number;
  unidad: string;
  // ADR-379. Sin `productId` el ítem no puede salir del stock: es un texto
  // escrito a mano. Con él, la devolución mueve inventario al marcarse enviada.
  productId?: number;
  precioUnitario?: number;
}

export interface Devolucion {
  id: string;
  createdAt: string;
  updatedAt?: string;
  proveedorNombre: string;
  /** Lo guarda el alta (`proveedorId`); las viejas pueden no tenerlo → el nombre queda como texto. */
  proveedorId?: string | null;
  items: ItemDevuelto[];
  motivo: string;
  estado: DevolucionEstado;
  notas?: string | null;
  /** Cuándo salió la mercadería del stock (ADR-379). Null = todavía no salió. */
  stockAplicadoAt?: string | null;
}

export interface Proveedor {
  id: string;
  name: string;
}

export const soles = (n: number) => `${formatCurrency(n)}`;

/** Lo que el proveedor debe por un ítem. Sin precio no se puede afirmar nada. */
export function valorItem(item: ItemDevuelto): number | null {
  if (item.precioUnitario == null) return null;
  return item.precioUnitario * item.cantidad;
}

/** Total de la devolución y cuántos ítems quedaron sin precio (que se avisa). */
export function valorDevolucion(items: ItemDevuelto[]): { total: number; sinPrecio: number } {
  let total = 0;
  let sinPrecio = 0;
  for (const i of items) {
    const v = valorItem(i);
    if (v == null) sinPrecio++;
    else total += v;
  }
  return { total, sinPrecio };
}

export const MOTIVOS = [
  "Producto vencido",
  "Producto dañado",
  "Producto incorrecto",
  "Exceso de stock",
  "Precio incorrecto en factura",
  "Calidad no aceptable",
  "Otro",
];

export const UNIDADES = ["und", "kg", "caja", "paq", "bot"];

export const ESTADO_STYLES: Record<DevolucionEstado, string> = {
  PENDIENTE: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]",
  ENVIADA: "bg-[var(--data-info-100)] text-[var(--data-info-ink)]",
  RESUELTA: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
};

// El valor persistido sigue siendo ENVIADA; solo cambia lo que se lee.
export const ESTADO_LABEL: Record<DevolucionEstado, string> = {
  PENDIENTE: "Pendiente",
  ENVIADA: "Esperando respuesta",
  RESUELTA: "Resuelta",
};

export const ESTADO_SIGUIENTE: Record<DevolucionEstado, DevolucionEstado | null> = {
  PENDIENTE: "ENVIADA",
  ENVIADA: "RESUELTA",
  RESUELTA: null,
};

export const ESTADO_LABEL_SIGUIENTE: Record<DevolucionEstado, string> = {
  PENDIENTE: "Marcar enviada",
  ENVIADA: "Marcar resuelta",
  RESUELTA: "",
};

// Días desde el envío tras los cuales una devolución "esperando respuesta" se
// considera vencida y se resalta para no perderla.
export const DIAS_LIMITE_RESPUESTA = 7;

/** Días que una devolución lleva esperando respuesta (0 si no aplica). */
export function diasEsperando(dev: Devolucion): number {
  if (dev.estado !== "ENVIADA") return 0;
  const desde = new Date(dev.updatedAt ?? dev.createdAt).getTime();
  if (Number.isNaN(desde)) return 0;
  return Math.max(0, Math.floor((Date.now() - desde) / 86_400_000));
}

// ── Filtros ──────────────────────────────────────────────────────────────────

export type Periodo = "" | "semana" | "mes" | "30dias";

export const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: "", label: "Todas las fechas" },
  { id: "semana", label: "Últimos 7 días" },
  { id: "mes", label: "Este mes" },
  { id: "30dias", label: "Últimos 30 días" },
];

export interface FiltrosDevoluciones {
  estado: DevolucionEstado | "";
  proveedor: string;
  periodo: Periodo;
  texto: string;
}

export const SIN_FILTROS: FiltrosDevoluciones = { estado: "", proveedor: "", periodo: "", texto: "" };

function desdePeriodo(periodo: Periodo): number | null {
  const ahora = new Date();
  if (periodo === "semana") return ahora.getTime() - 7 * 86_400_000;
  if (periodo === "30dias") return ahora.getTime() - 30 * 86_400_000;
  if (periodo === "mes") return new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
  return null;
}

export function filtrarDevoluciones(lista: Devolucion[], f: FiltrosDevoluciones): Devolucion[] {
  const desde = desdePeriodo(f.periodo);
  const q = f.texto.trim().toLowerCase();
  return lista.filter((d) => {
    if (f.estado && d.estado !== f.estado) return false;
    if (f.proveedor && d.proveedorNombre !== f.proveedor) return false;
    if (desde != null && new Date(d.createdAt).getTime() < desde) return false;
    if (q) {
      const pajar = `${d.proveedorNombre} ${d.motivo} ${d.items.map((i) => i.nombre).join(" ")}`.toLowerCase();
      if (!pajar.includes(q)) return false;
    }
    return true;
  });
}

export function conteoPorEstado(lista: Devolucion[]): Record<DevolucionEstado, number> {
  const c: Record<DevolucionEstado, number> = { PENDIENTE: 0, ENVIADA: 0, RESUELTA: 0 };
  for (const d of lista) c[d.estado]++;
  return c;
}

/** Lo que el proveedor todavía debe: devoluciones sin resolver, al costo registrado. */
export function montoPorReclamar(lista: Devolucion[]): { total: number; sinPrecio: number } {
  let total = 0;
  let sinPrecio = 0;
  for (const d of lista) {
    if (d.estado === "RESUELTA") continue;
    const v = valorDevolucion(d.items);
    total += v.total;
    sinPrecio += v.sinPrecio;
  }
  return { total, sinPrecio };
}

/** Traduce una respuesta fallida a algo accionable (reporte QA Compras 2026-08-12). */
export async function mensajeDeError(res: Response, accion: string): Promise<string> {
  const body = (await res.json().catch((err: unknown) => {
    console.warn("[DevolucionesProveedorModule] respuesta de error sin JSON:", String(err));
    return null;
  })) as { error?: unknown; detail?: unknown } | null;
  const detalle =
    typeof body?.detail === "string" ? body.detail
    : typeof body?.error === "string" ? body.error
    : null;

  switch (res.status) {
    case 400: return detalle ?? "Faltan datos o son inválidos. Revisa el formulario.";
    case 401:
    case 403: return "Tu sesión venció. Recarga la página e intenta de nuevo.";
    case 402: return detalle ?? "El plan de esta tienda no permite registrar cambios.";
    case 404: return "Esa devolución ya no está disponible. Recarga la lista.";
    case 429: return "Demasiados intentos seguidos. Espera unos segundos.";
    default: return detalle ?? `No se pudo ${accion} (error ${res.status}).`;
  }
}
