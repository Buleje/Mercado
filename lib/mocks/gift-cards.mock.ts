/**
 * lib/mocks/gift-cards.mock.ts — Agent E
 *
 * Datos mock para Tarjetas de Regalo Buleje.
 * NO tocar Prisma schema (zona peligrosa). Integracion real pendiente en ADR
 * dedicado.
 */

export type GiftCardStatus = "activa" | "canjeada" | "expirada";
export type GiftCardDesign =
  | "cumpleanos"
  | "navidad"
  | "felicitaciones"
  | "aniversario"
  | "gracias"
  | "anio-nuevo"
  | "bienvenida"
  | "general";

export type MockGiftCard = {
  id: string;
  code: string;
  tenantId: string;
  amount: number;
  balance: number;
  design: GiftCardDesign;
  message: string;
  senderName: string;
  senderUserId: string;
  recipientName: string;
  recipientContact: string;
  contactMethod: "email" | "whatsapp";
  status: GiftCardStatus;
  createdAt: string;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  expiresAt: string | null;
};

export type MockGiftCardUsage = {
  id: string;
  giftCardId: string;
  userId: string;
  tenantId: string;
  orderId: string | null;
  orderNumber: string | null;
  amount: number;
  balanceAfter: number;
  storeName: string;
  createdAt: string;
};

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Denominaciones predefinidas (Amazon-style). */
export const GIFT_CARD_DENOMINATIONS: ReadonlyArray<{
  amount: number;
  label: string;
  hint: string;
}> = [
  { amount: 20, label: "S/ 20", hint: "Para un antojo rapido" },
  { amount: 50, label: "S/ 50", hint: "Una compra semanal" },
  { amount: 100, label: "S/ 100", hint: "Popular" },
  { amount: 200, label: "S/ 200", hint: "Regalo grande" },
  { amount: 500, label: "S/ 500", hint: "Para ocasiones especiales" },
  { amount: 0, label: "Personalizado", hint: "Desde S/ 10 hasta S/ 1000" },
];

/** Catalogo de disenios (mapea a ilustraciones reutilizables). */
export const GIFT_CARD_DESIGNS: ReadonlyArray<{
  id: GiftCardDesign;
  label: string;
  description: string;
  palette: string;
}> = [
  { id: "cumpleanos",    label: "Cumpleanos",     description: "Para festejar un anio mas", palette: "rose"     },
  { id: "navidad",       label: "Navidad",        description: "Con espiritu navideno",     palette: "emerald"  },
  { id: "felicitaciones",label: "Felicitaciones", description: "Por un logro importante",   palette: "amber"    },
  { id: "aniversario",   label: "Aniversario",    description: "Para celebrar juntos",      palette: "violet"   },
  { id: "gracias",       label: "Gracias",        description: "Un gesto de agradecimiento",palette: "sky"      },
  { id: "anio-nuevo",    label: "Anio Nuevo",     description: "Que arranque con buen pie", palette: "indigo"   },
  { id: "bienvenida",    label: "Bienvenida",     description: "Para el nuevo vecino",      palette: "teal"     },
  { id: "general",       label: "General",        description: "Para cualquier ocasion",    palette: "slate"    },
];

/** Tarjetas recibidas / enviadas — en memoria para prototipo. */
export const MOCK_GIFT_CARDS: MockGiftCard[] = [
  {
    id: "gc_001",
    code: "BULJ-M5GT-XR4P",
    tenantId: "main",
    amount: 100,
    balance: 100,
    design: "cumpleanos",
    message: "Feliz cumple vecino, que la pases bien!",
    senderName: "Juana Perez",
    senderUserId: "user_juana",
    recipientName: "Carlos Ramos",
    recipientContact: "+51 987 654 321",
    contactMethod: "whatsapp",
    status: "activa",
    createdAt: "2026-04-10T12:00:00Z",
    redeemedAt: null,
    redeemedByUserId: null,
    expiresAt: null,
  },
  {
    id: "gc_002",
    code: "BULJ-9QKL-V7TH",
    tenantId: "main",
    amount: 50,
    balance: 20,
    design: "gracias",
    message: "Gracias por tu ayuda con la mudanza.",
    senderName: "Marta Soto",
    senderUserId: "user_marta",
    recipientName: "Tu",
    recipientContact: "usuario@buleje.pe",
    contactMethod: "email",
    status: "activa",
    createdAt: "2026-03-22T15:30:00Z",
    redeemedAt: "2026-04-01T10:00:00Z",
    redeemedByUserId: "user_me",
    expiresAt: null,
  },
  {
    id: "gc_003",
    code: "BULJ-HP3N-ZM8W",
    tenantId: "main",
    amount: 200,
    balance: 0,
    design: "aniversario",
    message: "Por 5 anios juntos. Te amo.",
    senderName: "Luis Guerra",
    senderUserId: "user_luis",
    recipientName: "Tu",
    recipientContact: "usuario@buleje.pe",
    contactMethod: "email",
    status: "canjeada",
    createdAt: "2026-02-14T09:00:00Z",
    redeemedAt: "2026-02-15T18:00:00Z",
    redeemedByUserId: "user_me",
    expiresAt: null,
  },
  {
    id: "gc_004",
    code: "BULJ-T2WB-K6RQ",
    tenantId: "main",
    amount: 50,
    balance: 50,
    design: "felicitaciones",
    message: "Por tu promocion en el trabajo!",
    senderName: "Tu",
    senderUserId: "user_me",
    recipientName: "Ana Torres",
    recipientContact: "+51 998 123 456",
    contactMethod: "whatsapp",
    status: "activa",
    createdAt: "2026-04-05T11:15:00Z",
    redeemedAt: null,
    redeemedByUserId: null,
    expiresAt: null,
  },
  {
    id: "gc_005",
    code: "BULJ-FJ4D-NX9C",
    tenantId: "main",
    amount: 100,
    balance: 0,
    design: "navidad",
    message: "Felices fiestas a toda la familia.",
    senderName: "Tu",
    senderUserId: "user_me",
    recipientName: "Familia Lopez",
    recipientContact: "lopez@correo.com",
    contactMethod: "email",
    status: "canjeada",
    createdAt: "2025-12-22T20:00:00Z",
    redeemedAt: "2025-12-25T12:00:00Z",
    redeemedByUserId: "user_lopez",
    expiresAt: null,
  },
];

/** Historial de uso: como se gasto el balance. */
export const MOCK_GIFT_CARD_USAGE: MockGiftCardUsage[] = [
  {
    id: "gcu_001",
    giftCardId: "gc_002",
    userId: "user_me",
    tenantId: "main",
    orderId: "ord_881",
    orderNumber: "BUL-881",
    amount: 30,
    balanceAfter: 20,
    storeName: "Buleje",
    createdAt: "2026-04-01T10:00:00Z",
  },
  {
    id: "gcu_002",
    giftCardId: "gc_003",
    userId: "user_me",
    tenantId: "main",
    orderId: "ord_742",
    orderNumber: "BUL-742",
    amount: 200,
    balanceAfter: 0,
    storeName: "Minimarket Los Pinos",
    createdAt: "2026-02-15T18:00:00Z",
  },
];

/** Tipos para respuesta API (alias sin `server-only`). */
export type PublicGiftCard = MockGiftCard;
export type PublicGiftCardUsage = MockGiftCardUsage;
