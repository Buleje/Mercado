/**
 * Mock data para "Bodega al Mes" — Subscribe & Save.
 *
 * Datos realistas del contexto de Pucallpa: familias que compran recurrentes,
 * senoras del barrio, repartidores, etc.
 *
 * Consumido por:
 *  - Admin SubscriptionsModule (vista vendedor / superadmin)
 *  - /cuenta/suscripciones (vista cliente, seed inicial si localStorage vacio)
 */

import type {
  SubscriptionPlan,
  SubscriptionFrequency,
} from "@/contexts/subscription-context";

export interface MockSubscriptionWithCustomer extends SubscriptionPlan {
  customerName: string;
  customerPhone: string;
  customerZone: string;
}

const FREQUENCY_DAYS: Record<SubscriptionFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
};

/** Genera fecha ISO offset de hoy en dias (positivo = futuro, negativo = pasado). */
function isoOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * 8 suscripciones mock con datos realistas de bodega familiar Pucallpa.
 * Incluye datos del cliente (usado por admin) — el cliente solo ve su propia
 * lista, el admin ve todas.
 */
export const MOCK_SUBSCRIPTIONS: MockSubscriptionWithCustomer[] = [
  {
    id: "sub-mock-arroz-maria",
    productId: "1001",
    productName: "Arroz Extra Gourmet 5 kg",
    productImage: "/products/arroz-5kg.jpg",
    unitPrice: 28.9,
    quantity: 2,
    frequency: "monthly",
    nextDelivery: isoOffsetDays(5),
    discount: 0.05,
    status: "active",
    createdAt: isoOffsetDays(-62),
    savedAmount: 8.67,
    customerName: "Maria Gonzales",
    customerPhone: "989123456",
    customerZone: "Callería",
  },
  {
    id: "sub-mock-leche-familia",
    productId: "1002",
    productName: "Leche Gloria Evaporada x12 tarros",
    productImage: "/products/leche-gloria-12.jpg",
    unitPrice: 68.0,
    quantity: 1,
    frequency: "monthly",
    nextDelivery: isoOffsetDays(12),
    discount: 0.05,
    status: "active",
    createdAt: isoOffsetDays(-95),
    savedAmount: 10.2,
    customerName: "Familia Gonzales",
    customerPhone: "987654321",
    customerZone: "Yarinacocha",
  },
  {
    id: "sub-mock-detergente-carmen",
    productId: "1003",
    productName: "Detergente Ariel Liquido 2L",
    productImage: "/products/ariel-2l.jpg",
    unitPrice: 32.5,
    quantity: 1,
    frequency: "bimonthly",
    nextDelivery: isoOffsetDays(25),
    discount: 0.05,
    status: "active",
    createdAt: isoOffsetDays(-125),
    savedAmount: 4.88,
    customerName: "Carmen Rojas",
    customerPhone: "985544321",
    customerZone: "Manantay",
  },
  {
    id: "sub-mock-yogurt-luis",
    productId: "1004",
    productName: "Yogurt Natural Gloria 1L",
    productImage: "/products/yogurt-natural.jpg",
    unitPrice: 8.9,
    quantity: 3,
    frequency: "weekly",
    nextDelivery: isoOffsetDays(2),
    discount: 0.05,
    status: "active",
    createdAt: isoOffsetDays(-45),
    savedAmount: 8.01,
    customerName: "Luis Perez",
    customerPhone: "988112233",
    customerZone: "Centro",
  },
  {
    id: "sub-mock-aceite-don-pedro",
    productId: "1005",
    productName: "Aceite Primor 1L",
    productImage: "/products/aceite-primor.jpg",
    unitPrice: 12.9,
    quantity: 2,
    frequency: "monthly",
    nextDelivery: isoOffsetDays(8),
    discount: 0.05,
    status: "active",
    createdAt: isoOffsetDays(-78),
    savedAmount: 3.87,
    customerName: "Pedro Vargas",
    customerPhone: "987223344",
    customerZone: "Callería",
  },
  {
    id: "sub-mock-coca-familia-saldana",
    productId: "1006",
    productName: "Coca Cola 3L (pack x 4)",
    productImage: "/products/coca-3l.jpg",
    unitPrice: 48.0,
    quantity: 1,
    frequency: "biweekly",
    nextDelivery: isoOffsetDays(4),
    discount: 0.05,
    status: "active",
    createdAt: isoOffsetDays(-28),
    savedAmount: 7.2,
    customerName: "Familia Saldana",
    customerPhone: "986554433",
    customerZone: "Yarinacocha",
  },
  {
    id: "sub-mock-jabon-rosa",
    productId: "1007",
    productName: "Jabon Bolivar x6 unidades",
    productImage: "/products/jabon-bolivar.jpg",
    unitPrice: 14.5,
    quantity: 1,
    frequency: "monthly",
    nextDelivery: isoOffsetDays(-2), // vencido (listo para enviar)
    discount: 0.05,
    status: "active",
    createdAt: isoOffsetDays(-92),
    savedAmount: 2.18,
    customerName: "Rosa Flores",
    customerPhone: "985998877",
    customerZone: "Centro",
  },
  {
    id: "sub-mock-pasta-familia-torres",
    productId: "1008",
    productName: "Fideos Don Vittorio Spaghetti 500g x 6",
    productImage: "/products/fideos-6pack.jpg",
    unitPrice: 18.9,
    quantity: 1,
    frequency: "monthly",
    nextDelivery: isoOffsetDays(15),
    discount: 0.05,
    status: "paused",
    createdAt: isoOffsetDays(-180),
    savedAmount: 5.67,
    customerName: "Familia Torres",
    customerPhone: "983112255",
    customerZone: "Manantay",
  },
];

/** Lista filtrable por estado para el dashboard admin. */
export function getMockSubscriptionsByStatus(
  status: SubscriptionPlan["status"],
): MockSubscriptionWithCustomer[] {
  return MOCK_SUBSCRIPTIONS.filter((s) => s.status === status);
}

/** Solo las suscripciones (sin datos de cliente) — para seedear el customer context. */
export const MOCK_SUBSCRIPTIONS_CUSTOMER_SEED: SubscriptionPlan[] =
  MOCK_SUBSCRIPTIONS.slice(0, 4).map(({ customerName: _cn, customerPhone: _cp, customerZone: _cz, ...rest }) => rest);

// ── Productos suscribibles (mock) para homepage marketplace ─────────────────

export interface SubscribableProductMock {
  productId: string;
  name: string;
  image: string;
  price: number;
  unit: string;
  category: string;
  storeName: string;
  storeSlug: string;
  /** cuantos clientes lo tienen suscrito (social proof). */
  subscribers: number;
}

export const MOCK_SUBSCRIBABLE_PRODUCTS: SubscribableProductMock[] = [
  {
    productId: "1001",
    name: "Arroz Extra Gourmet 5 kg",
    image: "/products/arroz-5kg.jpg",
    price: 28.9,
    unit: "bolsa",
    category: "Abarrotes",
    storeName: "Bodega San Martin",
    storeSlug: "bodega-san-martin",
    subscribers: 42,
  },
  {
    productId: "1002",
    name: "Leche Gloria Evaporada x12",
    image: "/products/leche-gloria-12.jpg",
    price: 68.0,
    unit: "pack",
    category: "Lacteos",
    storeName: "Bodega San Martin",
    storeSlug: "bodega-san-martin",
    subscribers: 31,
  },
  {
    productId: "1003",
    name: "Detergente Ariel 2L",
    image: "/products/ariel-2l.jpg",
    price: 32.5,
    unit: "botella",
    category: "Limpieza",
    storeName: "Bodega San Martin",
    storeSlug: "bodega-san-martin",
    subscribers: 28,
  },
  {
    productId: "1004",
    name: "Yogurt Natural 1L",
    image: "/products/yogurt-natural.jpg",
    price: 8.9,
    unit: "litro",
    category: "Lacteos",
    storeName: "Bodega San Martin",
    storeSlug: "bodega-san-martin",
    subscribers: 19,
  },
  {
    productId: "1005",
    name: "Aceite Primor 1L",
    image: "/products/aceite-primor.jpg",
    price: 12.9,
    unit: "botella",
    category: "Abarrotes",
    storeName: "Bodega San Martin",
    storeSlug: "bodega-san-martin",
    subscribers: 55,
  },
  {
    productId: "1006",
    name: "Coca Cola 3L (pack x 4)",
    image: "/products/coca-3l.jpg",
    price: 48.0,
    unit: "pack",
    category: "Bebidas",
    storeName: "Bodega San Martin",
    storeSlug: "bodega-san-martin",
    subscribers: 24,
  },
  {
    productId: "1007",
    name: "Jabon Bolivar x6",
    image: "/products/jabon-bolivar.jpg",
    price: 14.5,
    unit: "pack",
    category: "Limpieza",
    storeName: "Bodega San Martin",
    storeSlug: "bodega-san-martin",
    subscribers: 37,
  },
  {
    productId: "1008",
    name: "Fideos Don Vittorio x6",
    image: "/products/fideos-6pack.jpg",
    price: 18.9,
    unit: "pack",
    category: "Abarrotes",
    storeName: "Bodega San Martin",
    storeSlug: "bodega-san-martin",
    subscribers: 48,
  },
];

/** Calcula la tasa de churn mensual mock. */
export const MOCK_CHURN_RATE = 0.042;

/** Dias entre suscripciones para un KPI admin. */
export function computeFrequencyDays(
  frequency: SubscriptionFrequency,
): number {
  return FREQUENCY_DAYS[frequency];
}
