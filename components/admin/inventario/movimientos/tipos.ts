/**
 * Lo que comparten las secciones de «Entradas y salidas» (Movimientos y
 * Pérdidas) y Vencimientos: los tipos de movimiento, las causas de una
 * pérdida, el período y las cuentas puras (sin React) que las tablas y los
 * indicadores muestran. Puro a propósito: lo prueba
 * `__tests__/inventario-movimientos-cuentas.test.ts`.
 *
 * Una pérdida ES un movimiento de salida (`InventoryMovement` con
 * `type = "merma"`, `lib/db/mermas.db.ts`): por eso Pérdidas dejó de ser una
 * pestaña aparte y es una sección de Entradas y salidas.
 */
import {
  AlertTriangle, Coins, Globe, HelpCircle, Minus, Package, Plus, ShoppingCart, Undo2, ArrowLeftRight,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";

// ── Movimientos ────────────────────────────────────────────────────────────────

export type Movimiento = {
  id: string;
  productId: number;
  productName?: string;
  type: string;
  /** Sólo en las pérdidas (`type = "merma"`): por qué se perdió. */
  lossType?: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
};

export type ProductoDeMovimiento = {
  id: number;
  name: string;
  unit: string;
  stock: number;
  category: string;
  /** Costo de HOY: el movimiento no guarda el costo que tenía cuando pasó. */
  costPrice: number;
};

/**
 * `neutral` = movió el COSTO, no la cantidad (ADR-377: el flete cargado a una
 * orden ya recibida se registra como `ajuste` con `quantity: 0`). Sin esta
 * categoría caía como salida y el kardex restaba mercadería que no se movió.
 */
export type Direccion = "in" | "out" | "neutral";

export const TIPOS: Record<string, { label: string; Icon: LucideIcon; dir: Direccion }> = {
  compra:           { label: "Compra",        Icon: Package, dir: "in" },
  devolucion:       { label: "Devolución",    Icon: Undo2, dir: "in" },
  ajuste_positivo:  { label: "Ajuste (+)",    Icon: Plus, dir: "in" },
  venta:            { label: "Venta",         Icon: ShoppingCart, dir: "out" },
  venta_online:     { label: "Venta online",  Icon: Globe, dir: "out" },
  ajuste_negativo:  { label: "Ajuste (−)",    Icon: Minus, dir: "out" },
  merma:            { label: "Pérdida",       Icon: AlertTriangle, dir: "out" },
  transferencia:    { label: "Transferencia", Icon: ArrowLeftRight, dir: "out" },
  // ADR-379: mercadería devuelta AL proveedor (sale); `devolucion` es la del cliente (entra).
  devolucion_proveedor: { label: "Devuelto al proveedor", Icon: Undo2, dir: "out" },
  ajuste:           { label: "Ajuste de costo", Icon: Coins, dir: "neutral" },
};

/** Un tipo desconocido NO se asume salida: queda sin clasificar y fuera de las sumas. */
export function metaDeTipo(type: string): { label: string; Icon: LucideIcon; dir: Direccion } {
  return TIPOS[type] ?? { label: type, Icon: HelpCircle, dir: "neutral" };
}

/** Tipos que se registran a mano (las ventas vienen del POS y la tienda). */
export const TIPOS_DE_ENTRADA = [
  { v: "compra", label: "Compra (reposición)" },
  { v: "devolucion", label: "Devolución de cliente" },
  { v: "ajuste_positivo", label: "Ajuste (+): sobró stock" },
] as const;
export const TIPOS_DE_SALIDA = [
  { v: "ajuste_negativo", label: "Ajuste (−): faltó stock" },
  { v: "merma", label: "Pérdida (con su causa)" },
  { v: "transferencia", label: "Transferencia o salida" },
] as const;

// ── Pérdidas ───────────────────────────────────────────────────────────────────

/** Las 4 causas que acepta `/api/mermas` y `/api/inventory-movements` (`lossType`). */
export type Causa = "expiry" | "damages" | "theft" | "obsolescence";
export const CAUSAS: readonly Causa[] = ["expiry", "damages", "theft", "obsolescence"];

export const CAUSA: Record<Causa, { label: string; chip: string }> = {
  expiry: { label: "Vencimiento", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/25 dark:text-[var(--data-warning-500)]" },
  damages: { label: "Rotura", chip: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/25 dark:text-[var(--data-error-500)]" },
  theft: { label: "Robo o faltante", chip: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  obsolescence: { label: "Deterioro", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/25 dark:text-[var(--data-warning-500)]" },
};

/**
 * La causa de una pérdida. Sin `lossType` (las que registraba el kardex o la
 * baja de un lote antes del 10-10) el servidor la lee como «damages»: acá se
 * hace lo mismo para que las dos pantallas digan lo mismo.
 */
export function causaDe(lossType: string | null | undefined): Causa {
  return (CAUSAS as readonly string[]).includes(lossType ?? "") ? (lossType as Causa) : "damages";
}

export interface ResumenPerdidas {
  /** Σ cantidad × costo de HOY del producto. Derivado: el movimiento no guarda su costo. */
  soles: number;
  unidades: number;
  registros: number;
  /** Una fila por causa con algo, de la que más costó a la que menos. */
  porCausa: { causa: Causa; soles: number; unidades: number; registros: number }[];
  /** Pérdidas de productos sin costo cargado: suman 0 soles y se dice. */
  sinCosto: number;
}

export function resumirPerdidas(
  perdidas: readonly Pick<Movimiento, "productId" | "quantity" | "lossType">[],
  costoDe: (productId: number) => number,
): ResumenPerdidas {
  const acc = new Map<Causa, { soles: number; unidades: number; registros: number }>();
  let soles = 0;
  let unidades = 0;
  let sinCosto = 0;
  for (const p of perdidas) {
    const costo = costoDe(p.productId);
    if (!(costo > 0)) sinCosto++;
    const s = (costo > 0 ? costo : 0) * p.quantity;
    soles += s;
    unidades += p.quantity;
    const c = causaDe(p.lossType);
    const fila = acc.get(c) ?? { soles: 0, unidades: 0, registros: 0 };
    fila.soles += s;
    fila.unidades += p.quantity;
    fila.registros += 1;
    acc.set(c, fila);
  }
  const porCausa = [...acc.entries()]
    .map(([causa, v]) => ({ causa, ...v }))
    .sort((a, b) => b.soles - a.soles || b.unidades - a.unidades);
  return { soles: redondear(soles), unidades, registros: perdidas.length, porCausa, sinCosto };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// ── Totales de lo que se está viendo ──────────────────────────────────────────

export interface TotalesMovimientos {
  count: number;
  entradas: number;
  salidas: number;
  neto: number;
  /** Recosteos: no suman ni restan, pero se cuentan para que el total no mienta. */
  neutrales: number;
}

export function totalesDe(lista: readonly { dir: Direccion; quantity: number }[]): TotalesMovimientos {
  let entradas = 0;
  let salidas = 0;
  let neutrales = 0;
  for (const m of lista) {
    if (m.dir === "in") entradas += m.quantity;
    else if (m.dir === "out") salidas += m.quantity;
    else neutrales++;
  }
  return { count: lista.length, entradas, salidas, neto: entradas - salidas, neutrales };
}

// ── Período ────────────────────────────────────────────────────────────────────

export type Periodo = "hoy" | "7d" | "30d" | "todo";
export const PERIODOS: { v: Periodo; label: string }[] = [
  { v: "hoy", label: "Hoy" },
  { v: "7d", label: "7 días" },
  { v: "30d", label: "30 días" },
  { v: "todo", label: "Todo" },
];
export const EN_EL_PERIODO: Record<Periodo, string> = { hoy: "hoy", "7d": "en 7 días", "30d": "en 30 días", todo: "en total" };

/**
 * Desde cuándo cuenta el período, en milisegundos; `null` = sin límite.
 * «Hoy» empieza a la medianoche LOCAL (`inicioDeHoy`), no a la de UTC: con
 * `new Date("2026-08-12")` arrastraba lo registrado desde las 19:00 de ayer.
 */
export function desdeDe(p: Periodo, ahora: number, inicioDeHoy: number): number | null {
  if (p === "todo") return null;
  if (p === "hoy") return inicioDeHoy;
  return ahora - (p === "7d" ? 7 : 30) * 86_400_000;
}

// ── Fechas que se leen («jueves 10/09») ───────────────────────────────────────

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «jueves 10/09» de una fecha `YYYY-MM-DD`, sin depender del ICU del navegador. */
export function diaConNombre(clave: string): string {
  const d = new Date(`${clave.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return clave;
  return `${DIAS[d.getUTCDay()]} ${clave.slice(8, 10)}/${clave.slice(5, 7)}`;
}

/** Días entre dos claves `YYYY-MM-DD` (b − a), contados como días del calendario. */
export function diasEntre(a: string, b: string): number {
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00.000Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((tb - ta) / 86_400_000);
}

/** «hoy», «ayer» o «jueves 10/09» del día de Pucallpa en que pasó. */
export function diaDelMovimiento(iso: string, hoy = limaDateKey()): string {
  const clave = limaDateKey(iso);
  if (!clave) return iso;
  const d = diasEntre(clave, hoy);
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  return diaConNombre(clave);
}
