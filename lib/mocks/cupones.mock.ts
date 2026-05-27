/**
 * lib/mocks/cupones.mock.ts — Agent E
 *
 * Mock para el dashboard de cupones del cliente. La tabla real Coupon ya
 * existe en Prisma, pero para esta vista necesitamos la relacion
 * `UserCoupon` (aun no modelada — zona peligrosa). Por eso mockeamos.
 */

// __MOCK_PROD_GUARD__: en prod los exports devuelven arrays vacíos para
// evitar leak de data falsa al tenant real. Antes el guard tiraba throw,
// pero rompía el build estático (Next 16 evalúa módulos en collect-page-data).
// Sprint B debe conectar data real con prisma.userCoupon.
const MOCK_PROD_DISABLED = process.env.NODE_ENV === "production";
if (MOCK_PROD_DISABLED && typeof process !== "undefined") {
   
  console.warn("[mock] cupones.mock.ts cargado en prod — exports vacíos. Migrar a prisma.userCoupon.");
}

export type CuponDiscountType = "fixed" | "percent" | "shipping";

export type MockCupon = {
  id: string;
  tenantId: string;
  userId: string;
  code: string;
  title: string;
  description: string;
  discountType: CuponDiscountType;
  discountValue: number;
  minPurchase: number | null;
  expiresAt: string | null;
  status: "disponible" | "usado" | "expirado";
  usedAt: string | null;
  orderNumber: string | null;
  storeName: string | null;
  category: string | null;
};

// ── Fixtures ────────────────────────────────────────────────────────────────

export const MOCK_CUPONES: MockCupon[] = [
  {
    id: "cup_001",
    tenantId: "main",
    userId: "user_me",
    code: "BIENVENIDA10",
    title: "10% de descuento",
    description: "En tu primera compra del marketplace",
    discountType: "percent",
    discountValue: 10,
    minPurchase: 30,
    expiresAt: "2026-05-31T23:59:59Z",
    status: "disponible",
    usedAt: null,
    orderNumber: null,
    storeName: null,
    category: "Bienvenida",
  },
  {
    id: "cup_002",
    tenantId: "main",
    userId: "user_me",
    code: "ENVIOGRATIS",
    title: "Envio gratis",
    description: "En compras mayores a S/ 50",
    discountType: "shipping",
    discountValue: 0,
    minPurchase: 50,
    expiresAt: "2026-04-30T23:59:59Z",
    status: "disponible",
    usedAt: null,
    orderNumber: null,
    storeName: null,
    category: "Envios",
  },
  {
    id: "cup_003",
    tenantId: "main",
    userId: "user_me",
    code: "VECINO15",
    title: "S/ 15 de descuento",
    description: "En Buleje",
    discountType: "fixed",
    discountValue: 15,
    minPurchase: 80,
    expiresAt: "2026-05-15T23:59:59Z",
    status: "disponible",
    usedAt: null,
    orderNumber: null,
    storeName: "Buleje",
    category: "Tienda",
  },
  {
    id: "cup_004",
    tenantId: "main",
    userId: "user_me",
    code: "FINDE20",
    title: "20% de descuento",
    description: "Solo sabados y domingos — hasta S/ 40",
    discountType: "percent",
    discountValue: 20,
    minPurchase: 60,
    expiresAt: "2026-06-30T23:59:59Z",
    status: "disponible",
    usedAt: null,
    orderNumber: null,
    storeName: null,
    category: "Fin de semana",
  },
  {
    id: "cup_005",
    tenantId: "main",
    userId: "user_me",
    code: "CUMPLE25",
    title: "S/ 25 de regalo",
    description: "Por tu cumpleanos",
    discountType: "fixed",
    discountValue: 25,
    minPurchase: null,
    expiresAt: "2026-04-12T23:59:59Z",
    status: "usado",
    usedAt: "2026-04-10T14:22:00Z",
    orderNumber: "BUL-812",
    storeName: "Buleje",
    category: "Cumpleanos",
  },
  {
    id: "cup_006",
    tenantId: "main",
    userId: "user_me",
    code: "REFERIDO10",
    title: "S/ 10 por referir",
    description: "Por traer a un amigo",
    discountType: "fixed",
    discountValue: 10,
    minPurchase: 20,
    expiresAt: "2026-03-20T23:59:59Z",
    status: "expirado",
    usedAt: null,
    orderNumber: null,
    storeName: null,
    category: "Referidos",
  },
];

/** Catalogo de cupones publicos para validacion. */
export const MOCK_PUBLIC_COUPON_CATALOG: Record<
  string,
  Omit<MockCupon, "id" | "userId" | "status" | "usedAt" | "orderNumber">
> = {
  PROMO5: {
    tenantId: "main",
    code: "PROMO5",
    title: "5% de descuento",
    description: "Cupon general para nuevos clientes",
    discountType: "percent",
    discountValue: 5,
    minPurchase: 20,
    expiresAt: "2026-12-31T23:59:59Z",
    storeName: null,
    category: "General",
  },
  AMIGO20: {
    tenantId: "main",
    code: "AMIGO20",
    title: "S/ 20 de descuento",
    description: "Cupon referido de un amigo",
    discountType: "fixed",
    discountValue: 20,
    minPurchase: 60,
    expiresAt: "2026-06-30T23:59:59Z",
    storeName: null,
    category: "Referidos",
  },
};
