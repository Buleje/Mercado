import { ShoppingBasket, Package, Leaf, UtensilsCrossed, Boxes, Droplets, Sparkles } from "@buleje/design-system/icons";
import type { Product as BaseProduct } from "@/types/erp";
import type { ComprobanteTipo } from "@/components/admin/pos/POSPaymentModal";
import { formatCurrency } from "@/lib/format";

/**
 * Tipos y ayudas del POS (Vender) que comparten la vista y sus piezas.
 * Salieron de POSView.tsx al partirlo (08-10): mismo código, mismo comportamiento.
 */

// Mapeo de id de categoria → icono Lucide. Reemplaza los emojis originales
// por iconografia profesional coherente con el resto del admin.
export const CATEGORY_ICONS: Record<string, typeof Package> = {
  "todos": ShoppingBasket,
  "frutas-verduras": Leaf,
  "abarrotes": Package,
  "carnes": UtensilsCrossed,
  "lacteos": Boxes,
  "bebidas": Droplets,
  "limpieza": Sparkles,
};

/** Convierte un id/slug de categoría en una etiqueta legible (fallback). */
export function prettyCategory(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
}

export type Product = Omit<BaseProduct, "id"> & { id: number; stock?: number; stockMin?: number; type?: string };

export interface CartItem {
  product: Product;
  quantity: number;
  discount?: number; // percentage 0-100
}

export type PaymentMethod = "efectivo" | "yape" | "plin" | "tarjeta" | "fiado" | "trueque";

export interface SaleRecord {
  id: string;
  createdAt: string;
  total: number;
  payment: string;
  items: { quantity: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function fmt(n: number) { return `${formatCurrency(n)}`; }

export function readStoredIds(key: string) {
  if (typeof window === "undefined") return [] as number[];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [] as number[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number") : [];
  } catch {
    return [] as number[];
  }
}

// ── Mejora 4R2: Total en palabras ────────────────────────────────────────────
export function numeroAPalabras(n: number): string {
  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const especiales: Record<number, string> = { 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince' };

  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);

  let texto = '';
  if (entero === 0) texto = 'cero';
  else if (entero < 10) texto = unidades[entero];
  else if (especiales[entero]) texto = especiales[entero];
  else if (entero < 20) texto = `dieci${unidades[entero - 10]}`;
  else if (entero < 100) {
    const d = Math.floor(entero / 10);
    const u = entero % 10;
    texto = u === 0 ? decenas[d] : `${decenas[d]} y ${unidades[u]}`;
  } else if (entero < 1000) {
    const c = Math.floor(entero / 100);
    const resto = entero % 100;
    const centena = c === 1 ? (resto === 0 ? 'cien' : 'ciento') : `${unidades[c]}cientos`;
    texto = resto === 0 ? centena : `${centena} ${numeroAPalabras(resto)}`;
  } else {
    texto = `${Math.floor(entero / 1000)} mil ${entero % 1000 > 0 ? numeroAPalabras(entero % 1000) : ''}`;
  }

  return centavos > 0
    ? `${texto} soles con ${numeroAPalabras(centavos)} centimos`
    : `${texto} soles`;
}

/** Lo que se guarda de la última venta para el ticket por WhatsApp. */
export interface LastSaleDetails {
  items: { name: string; quantity: number; price: number }[];
  total: number;
  payment: string;
  customerPhone?: string;
  customerName?: string;
  discountAmount?: number;
  comprobanteTipo?: string;
  comprobanteNumero?: string;
}

/** Aviso flotante de stock (bajo, por vencer) con acción opcional. */
export interface StockAlert {
  message: string;
  type: "warning" | "danger";
  actionLabel?: string;
  actionFn?: () => void;
}

/** Datos extra que el modal de cobro le pasa a la venta. */
export interface ExtraCobro {
  comprobanteTipo: ComprobanteTipo;
  comprobanteRuc?: string;
  customerName?: string;
  discountAmount?: number;
  discountPercent?: number;
  /** Lo que el cliente dio en trueque: la ruta lo guarda como nota de la venta. */
  trueque?: { recibido: string; valor: number };
}
