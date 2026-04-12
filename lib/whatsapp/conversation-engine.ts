import "server-only";
import { prisma } from "@/lib/prisma";
import { OrdersDB } from "@/lib/db/orders.db";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import {
  type CartItem,
  formatWelcomeMenu,
  formatCategoryList,
  formatProductList,
  formatItemAdded,
  formatCart,
  formatAskAddress,
  formatOrderConfirmation,
  formatPaymentInstructions,
  formatHumanHandoff,
  formatError,
  formatProductNotFound,
  formatEmptyCartWarning,
} from "./message-templates";

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConversationState =
  | "idle"
  | "browsing"
  | "cart"
  | "checkout"
  | "awaiting_payment"
  | "completed";

export type ProcessResult = {
  reply: string;
  /** Estado siguiente de la conversación (ya persistido). */
  newState: ConversationState;
};

// ─── Intent detection helpers ─────────────────────────────────────────────────

const GREETING_RE = /^(hola|hi|buenas|buenos|buen\s+día|menu|ayuda|help|inicio|inicio|start)/i;
const CATEGORIES_RE = /^(ver\s+categor|categor|1\b)/i;
const SEARCH_RE = /^(buscar\s+|busca\s+|2\b|tienes\s+|hay\s+|tienen\s+)/i;
const MY_CART_RE = /^(mi\s+carrito|carrito|ver\s+carrito|3\b)/i;
const HUMAN_RE = /^(humano|persona|asesor|hablar\s+con|4\b|agente)/i;
const READY_RE = /^(listo|confirmar|confirmo|pedido\s+listo|finalizar)/i;
const CANCEL_RE = /^(cancelar|vaciar|cancelar\s+pedido|borrar\s+carrito)/i;
const HELP_RE = /^(ayuda|opciones|comandos|que\s+puedo)/i;

/**
 * Detecta patrón "N nombre" o "nombre": "2 coca cola", "quiero 3 leche", "agregar 1 arroz"
 */
const ADD_ITEM_RE =
  /^(?:quiero|agregar|dame|pon(?:me)?|añadir|anadir|pedir)?\s*(\d+)\s+(.+)/i;
const ADD_ITEM_NO_QTY_RE =
  /^(?:quiero|dame|pon(?:me)?|anadir|añadir|agregar)\s+(.+)/i;

function parseAddItem(
  text: string
): { quantity: number; term: string } | null {
  const m1 = ADD_ITEM_RE.exec(text);
  if (m1) {
    return { quantity: parseInt(m1[1], 10), term: m1[2].trim() };
  }
  const m2 = ADD_ITEM_NO_QTY_RE.exec(text);
  if (m2) {
    return { quantity: 1, term: m2[1].trim() };
  }
  return null;
}

function parseSearchTerm(text: string): string {
  return text
    .replace(/^(buscar|busca|tienes|hay|tienen)\s*/i, "")
    .replace(/^\d+\s+/, "")
    .trim();
}

// ─── Session helpers ──────────────────────────────────────────────────────────

async function getOrCreateSession(tenantId: string, phone: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  // Buscar sesión activa (no expirada)
  const existing = await prisma.whatsAppConversation.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });

  if (existing && existing.expiresAt > now) {
    return existing;
  }

  // Crear o reiniciar sesión (expirada o nueva)
  return prisma.whatsAppConversation.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: {
      tenantId,
      phone,
      state: "idle",
      cartItems: [],
      expiresAt,
    },
    update: {
      state: "idle",
      cartItems: [],
      deliveryAddress: null,
      lastMessageAt: now,
      expiresAt,
    },
  });
}

async function updateSession(
  id: string,
  patch: {
    state?: ConversationState;
    cartItems?: CartItem[];
    deliveryAddress?: string | null;
  }
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  return prisma.whatsAppConversation.update({
    where: { id },
    data: {
      ...(patch.state !== undefined && { state: patch.state }),
      ...(patch.cartItems !== undefined && {
        cartItems: patch.cartItems as never,
      }),
      ...(patch.deliveryAddress !== undefined && {
        deliveryAddress: patch.deliveryAddress,
      }),
      lastMessageAt: now,
      expiresAt,
    },
  });
}

function parseCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as CartItem[];
}

function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

// ─── Engine principal ─────────────────────────────────────────────────────────

/**
 * Procesa un mensaje entrante de WhatsApp y devuelve la respuesta del bot.
 * Persiste el estado de la conversación en `WhatsAppConversation`.
 */
export async function processMessage(
  tenantId: string,
  phone: string,
  messageText: string,
  config: {
    businessName: string;
    yapeNumber: string | null | undefined;
  }
): Promise<ProcessResult> {
  const text = messageText.trim();
  const upper = text.toUpperCase();
  const { businessName, yapeNumber } = config;

  const session = await getOrCreateSession(tenantId, phone);
  const state = session.state as ConversationState;
  const cart = parseCartItems(session.cartItems);

  try {
    // ── Comandos globales (funcionan desde cualquier estado) ──────────────
    if (GREETING_RE.test(text) || HELP_RE.test(text)) {
      await updateSession(session.id, { state: "idle", cartItems: [] });
      return { reply: formatWelcomeMenu(businessName), newState: "idle" };
    }

    if (CANCEL_RE.test(text)) {
      await updateSession(session.id, {
        state: "idle",
        cartItems: [],
        deliveryAddress: null,
      });
      return {
        reply: "Carrito vaciado. Escribe *hola* para volver al menú.",
        newState: "idle",
      };
    }

    if (MY_CART_RE.test(text)) {
      await updateSession(session.id, { state: "cart" });
      return {
        reply: formatCart(cart, cartTotal(cart)),
        newState: "cart",
      };
    }

    if (HUMAN_RE.test(text)) {
      await updateSession(session.id, { state: "idle" });
      return {
        reply: formatHumanHandoff(businessName),
        newState: "idle",
      };
    }

    // ── Estado: idle ──────────────────────────────────────────────────────
    if (state === "idle") {
      if (CATEGORIES_RE.test(text)) {
        return await handleShowCategories(session.id, tenantId);
      }
      if (SEARCH_RE.test(text) || SEARCH_RE.test(upper)) {
        const term = parseSearchTerm(text);
        return await handleSearch(session.id, tenantId, term);
      }
      // Intentar parsear "2 producto" directamente desde idle
      const addIntent = parseAddItem(text);
      if (addIntent) {
        return await handleAddItem(
          session.id,
          tenantId,
          cart,
          addIntent.term,
          addIntent.quantity
        );
      }
      // Categoría por número
      const catNum = parseInt(text.trim(), 10);
      if (!isNaN(catNum) && catNum >= 1) {
        return await handleCategoryByNumber(session.id, tenantId, catNum);
      }
      return { reply: formatWelcomeMenu(businessName), newState: "idle" };
    }

    // ── Estado: browsing ──────────────────────────────────────────────────
    if (state === "browsing") {
      if (CATEGORIES_RE.test(text)) {
        return await handleShowCategories(session.id, tenantId);
      }
      if (SEARCH_RE.test(text)) {
        const term = parseSearchTerm(text);
        return await handleSearch(session.id, tenantId, term);
      }
      // Selección por número de categoría
      const catNum = parseInt(text.trim(), 10);
      if (!isNaN(catNum) && catNum >= 1) {
        return await handleCategoryByNumber(session.id, tenantId, catNum);
      }
      // Agregar producto
      const addIntent = parseAddItem(text);
      if (addIntent) {
        return await handleAddItem(
          session.id,
          tenantId,
          cart,
          addIntent.term,
          addIntent.quantity
        );
      }
      // Texto libre = buscar
      return await handleSearch(session.id, tenantId, text);
    }

    // ── Estado: cart ──────────────────────────────────────────────────────
    if (state === "cart") {
      if (READY_RE.test(text)) {
        return await handleCheckout(session.id, cart, total =>
          formatAskAddress(businessName, total)
        );
      }
      // Agregar más desde el carrito
      const addIntent = parseAddItem(text);
      if (addIntent) {
        return await handleAddItem(
          session.id,
          tenantId,
          cart,
          addIntent.term,
          addIntent.quantity
        );
      }
      if (CATEGORIES_RE.test(text)) {
        return await handleShowCategories(session.id, tenantId);
      }
      if (SEARCH_RE.test(text)) {
        const term = parseSearchTerm(text);
        return await handleSearch(session.id, tenantId, term);
      }
      return { reply: formatCart(cart, cartTotal(cart)), newState: "cart" };
    }

    // ── Estado: checkout (esperando dirección) ────────────────────────────
    if (state === "checkout") {
      if (text.length < 5) {
        return {
          reply:
            "Por favor escribe tu dirección de entrega completa.\nEj: *Jr. Ucayali 123, cerca al mercado*",
          newState: "checkout",
        };
      }
      return await handleCreateOrder(
        session.id,
        tenantId,
        phone,
        cart,
        text,
        yapeNumber
      );
    }

    // ── Estado: awaiting_payment / completed ──────────────────────────────
    if (state === "awaiting_payment" || state === "completed") {
      return {
        reply:
          `Tu pedido ya fue registrado. Te contactaremos pronto.\n\n` +
          `Escribe *hola* si deseas hacer otro pedido.`,
        newState: state,
      };
    }

    // Fallback
    return { reply: formatWelcomeMenu(businessName), newState: "idle" };
  } catch (err) {
    logger.error("[conversation-engine] Error procesando mensaje", {
      tenantId,
      phone,
      error: err,
    });
    return {
      reply: formatError(),
      newState: "idle",
    };
  }
}

// ─── Handlers internos ────────────────────────────────────────────────────────

async function handleShowCategories(
  sessionId: string,
  tenantId: string
): Promise<ProcessResult> {
  const rows = await prisma.product.findMany({
    where: { tenantId, active: true, deletedAt: null },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  const categories = rows.map((r) => r.category).filter(Boolean);
  await updateSession(sessionId, { state: "browsing" });
  return {
    reply: formatCategoryList(categories),
    newState: "browsing",
  };
}

async function handleCategoryByNumber(
  sessionId: string,
  tenantId: string,
  num: number
): Promise<ProcessResult> {
  const rows = await prisma.product.findMany({
    where: { tenantId, active: true, deletedAt: null },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  const categories = rows.map((r) => r.category).filter(Boolean);
  const category = categories[num - 1];
  if (!category) {
    return {
      reply: formatCategoryList(categories),
      newState: "browsing",
    };
  }
  return await handleSearch(sessionId, tenantId, "", category);
}

async function handleSearch(
  sessionId: string,
  tenantId: string,
  term: string,
  categoryFilter?: string
): Promise<ProcessResult> {
  const where: Record<string, unknown> = {
    tenantId,
    active: true,
    deletedAt: null,
  };
  if (categoryFilter) {
    where.category = categoryFilter;
  } else if (term.length >= 2) {
    where.name = { contains: term, mode: "insensitive" };
  }

  const rows = await prisma.product.findMany({
    where,
    select: { id: true, name: true, price: true, stock: true, unit: true },
    take: 15,
    orderBy: { name: "asc" },
  });

  // TD-018: r.price es Decimal → convertir a number
  const products = rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: toNumOrZero(r.price),
    stock: r.stock,
    unit: r.unit ?? "und",
  }));

  await updateSession(sessionId, { state: "browsing" });
  return {
    reply: formatProductList(products, categoryFilter),
    newState: "browsing",
  };
}

async function handleAddItem(
  sessionId: string,
  tenantId: string,
  currentCart: CartItem[],
  term: string,
  quantity: number
): Promise<ProcessResult> {
  const product = await prisma.product.findFirst({
    where: {
      tenantId,
      active: true,
      deletedAt: null,
      name: { contains: term, mode: "insensitive" },
    },
    select: { id: true, name: true, price: true, unit: true, stock: true },
  });

  if (!product) {
    return { reply: formatProductNotFound(term), newState: "browsing" };
  }

  if ((product.stock ?? Infinity) < quantity) {
    const avail = product.stock ?? 0;
    return {
      reply:
        avail === 0
          ? `Lo sentimos, *${product.name}* está agotado.`
          : `Solo tenemos ${avail} ${product.unit} de *${product.name}*. ¿Quieres ${avail}?`,
      newState: "browsing",
    };
  }

  // TD-018: product.price es Decimal → convertir a number
  const productPriceNum = toNumOrZero(product.price);

  // Merge en carrito (sumar si ya existe)
  const existing = currentCart.findIndex((c) => c.productId === product.id);
  const updatedCart = [...currentCart];
  if (existing >= 0) {
    updatedCart[existing] = {
      ...updatedCart[existing],
      quantity: updatedCart[existing].quantity + quantity,
    };
  } else {
    updatedCart.push({
      productId: product.id,
      name: product.name,
      quantity,
      price: productPriceNum,
      unit: product.unit ?? "und",
    });
  }

  await updateSession(sessionId, { state: "cart", cartItems: updatedCart });

  const addedItem: CartItem = {
    productId: product.id,
    name: product.name,
    quantity,
    price: productPriceNum,
    unit: product.unit ?? "und",
  };

  return {
    reply: formatItemAdded(addedItem, updatedCart.length),
    newState: "cart",
  };
}

async function handleCheckout(
  sessionId: string,
  cart: CartItem[],
  buildReply: (total: number) => string
): Promise<ProcessResult> {
  if (cart.length === 0) {
    await updateSession(sessionId, { state: "idle" });
    return { reply: formatEmptyCartWarning(), newState: "idle" };
  }
  const total = cartTotal(cart);
  await updateSession(sessionId, { state: "checkout" });
  return { reply: buildReply(total), newState: "checkout" };
}

async function handleCreateOrder(
  sessionId: string,
  tenantId: string,
  phone: string,
  cart: CartItem[],
  address: string,
  yapeNumber: string | null | undefined
): Promise<ProcessResult> {
  if (cart.length === 0) {
    await updateSession(sessionId, { state: "idle" });
    return { reply: formatEmptyCartWarning(), newState: "idle" };
  }

  const total = cartTotal(cart);

  // Obtener o crear customer
  const customer = await prisma.customer.upsert({
    where: { phone },
    create: {
      phone,
      name: phone,
      location: address,
      reference: "",
      tenantId,
    },
    update: {
      location: address,
    },
    select: { name: true },
  });

  const orderId = crypto.randomUUID();

  const orderNow = new Date().toISOString();
  await OrdersDB.add(
    {
      id: orderId,
      customer: {
        name: customer.name,
        phone,
        location: address,
        reference: "",
      },
      items: cart.map((c) => ({
        id: c.productId,
        name: c.name,
        price: c.price,
        quantity: c.quantity,
        unit: c.unit,
        image: "",
      })),
      total,
      status: "pendiente",
      paymentMethod: "efectivo",
      notes: `[WhatsApp Commerce] Dirección: ${address}`,
      createdAt: orderNow,
      updatedAt: orderNow,
    },
    tenantId
  );

  await updateSession(sessionId, {
    state: "awaiting_payment",
    cartItems: [],
    deliveryAddress: address,
  });

  const confirmMsg = formatOrderConfirmation(orderId, cart, total, address);
  const paymentMsg = formatPaymentInstructions(total, yapeNumber);

  return {
    reply: `${confirmMsg}\n\n${paymentMsg}`,
    newState: "awaiting_payment",
  };
}
