/**
 * lib/mocks/socio-buleje.mock.ts — Mock data demo Socio Buleje.
 *
 * Reemplazar con API real cuando exista integración Stripe subscriptions.
 * ADR futuro: migrar a prisma.membership + stripe customer.
 */

import type { SocioPlan } from "@/lib/validators/socio-buleje";

export type MockSocioMembership = {
  userId: string;
  tenantId: string;
  plan: SocioPlan;
  status: "active" | "canceled" | "trial";
  startDate: string;
  endDate: string;
  cashbackBalance: number;
  totalSaved: number;
  totalOrdersWithFreeShipping: number;
  daysAsSocio: number;
  trialEndsAt?: string;
};

export type MockCashbackTransaction = {
  id: string;
  date: string;
  orderId: string;
  amount: number;
  reason: "purchase" | "redemption";
  description: string;
};

export type MockMonthlySaving = {
  month: string;
  amount: number;
};

export type MockExclusiveOffer = {
  productId: string;
  name: string;
  image: string | null;
  category: string;
  regularPrice: number;
  socioPrice: number;
  unit: string;
  storeName: string;
};

// Demo membership
export const MOCK_SOCIO_MEMBERSHIP: MockSocioMembership = {
  userId: "user_demo_01",
  tenantId: "main",
  plan: "yearly",
  status: "active",
  startDate: "2025-10-18",
  endDate: "2026-10-18",
  cashbackBalance: 47.3,
  totalSaved: 312.5,
  totalOrdersWithFreeShipping: 27,
  daysAsSocio: 182,
};

export const MOCK_CASHBACK_HISTORY: MockCashbackTransaction[] = [
  {
    id: "cb_001",
    date: "2026-04-17",
    orderId: "ord_xyz889",
    amount: 3.2,
    reason: "purchase",
    description: "5% de S/64 — Bodega Doña Elena",
  },
  {
    id: "cb_002",
    date: "2026-04-14",
    orderId: "ord_xyz877",
    amount: 2.1,
    reason: "purchase",
    description: "5% de S/42 — Minimarket Ucayali",
  },
  {
    id: "cb_003",
    date: "2026-04-10",
    orderId: "ord_xyz841",
    amount: 4.5,
    reason: "purchase",
    description: "5% de S/90 — Bodega Doña Elena",
  },
  {
    id: "cb_004",
    date: "2026-04-07",
    orderId: "ord_xyz820",
    amount: 1.3,
    reason: "purchase",
    description: "5% de S/26 — Frutería Amazónica",
  },
];

export const MOCK_MONTHLY_SAVINGS: MockMonthlySaving[] = [
  { month: "Nov 2025", amount: 34 },
  { month: "Dic 2025", amount: 58 },
  { month: "Ene 2026", amount: 41 },
  { month: "Feb 2026", amount: 62 },
  { month: "Mar 2026", amount: 55 },
  { month: "Abr 2026", amount: 47 },
];

export const MOCK_EXCLUSIVE_OFFERS: MockExclusiveOffer[] = [
  {
    productId: "p_001",
    name: "Arroz Costeño 5 kg",
    image: null,
    category: "Abarrotes",
    regularPrice: 22.5,
    socioPrice: 18.9,
    unit: "bolsa",
    storeName: "Bodega Doña Elena",
  },
  {
    productId: "p_002",
    name: "Aceite Primor 3L",
    image: null,
    category: "Abarrotes",
    regularPrice: 28.9,
    socioPrice: 24.5,
    unit: "unid",
    storeName: "Minimarket Ucayali",
  },
  {
    productId: "p_003",
    name: "Leche Gloria 1L x6",
    image: null,
    category: "Lácteos",
    regularPrice: 21.0,
    socioPrice: 17.9,
    unit: "pack",
    storeName: "Buleje",
  },
  {
    productId: "p_004",
    name: "Pan de molde Bimbo integral",
    image: null,
    category: "Panadería",
    regularPrice: 6.9,
    socioPrice: 5.5,
    unit: "unid",
    storeName: "Panadería La Ribera",
  },
  {
    productId: "p_005",
    name: "Detergente Ariel 1kg",
    image: null,
    category: "Limpieza",
    regularPrice: 17.5,
    socioPrice: 14.9,
    unit: "bolsa",
    storeName: "Buleje",
  },
  {
    productId: "p_006",
    name: "Plátano de seda 1kg",
    image: null,
    category: "Frutas",
    regularPrice: 4.5,
    socioPrice: 3.8,
    unit: "kg",
    storeName: "Frutería Amazónica",
  },
];

export const MOCK_TESTIMONIOS = [
  {
    id: "t1",
    name: "Doña Elena Ríos",
    zone: "Yarinacocha, Pucallpa",
    initials: "ER",
    text: "Con Socio ahorro casi S/ 50 al mes en delivery. Para una familia como la mía eso es un día de compras entero.",
    savings: 48,
  },
  {
    id: "t2",
    name: "Carlos Panduro",
    zone: "Callería, Pucallpa",
    initials: "CP",
    text: "Me gusta el acceso anticipado a las ofertas. Siempre encuentro lo que busco antes que se agote.",
    savings: 62,
  },
  {
    id: "t3",
    name: "María Torres",
    zone: "Manantay, Pucallpa",
    initials: "MT",
    text: "La atención por WhatsApp es rapidísima. Cuando tengo un problema con mi pedido, responden en minutos.",
    savings: 35,
  },
] as const;

export const MOCK_FAQS = [
  {
    q: "¿Cómo cancelo mi membresía?",
    a: "Puedes cancelar desde tu panel de Socio en cualquier momento. No hay permanencia ni penalidades.",
  },
  {
    q: "¿Hay contrato o permanencia mínima?",
    a: "No. Es una suscripción mes a mes (o anual) que puedes cancelar cuando quieras.",
  },
  {
    q: "¿El cashback es dinero en efectivo?",
    a: "El cashback se acumula en tu saldo Socio y puedes aplicarlo como descuento en tus próximas compras.",
  },
  {
    q: "¿Cómo me suscribo?",
    a: "Elige tu plan (mensual o anual), confirmá tu método de pago y listo. La membresía se activa al instante.",
  },
  {
    q: "¿Aplica en todas las bodegas de Buleje?",
    a: "Sí, el delivery gratis y el cashback aplican en todas las bodegas del marketplace. Los precios de Socio son específicos por producto.",
  },
  {
    q: "¿Puedo cambiar de plan mensual a anual?",
    a: "Sí, desde tu panel puedes cambiar al plan anual y se ajusta el prorrateo automáticamente.",
  },
  {
    q: "¿Qué pasa si no uso los beneficios un mes?",
    a: "Nada malo. Los beneficios se activan cuando los usás; el cashback acumulado no vence mientras seas Socio activo.",
  },
  {
    q: "¿Funciona el Socio si pido por WhatsApp?",
    a: "Sí. Tu bodeguera te atiende con prioridad y los beneficios aplican igual, solo mencioná tu número de Socio.",
  },
] as const;
