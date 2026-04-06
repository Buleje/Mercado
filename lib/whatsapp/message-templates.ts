import "server-only";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CartItem = {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
};

export type ProductEntry = {
  id: number;
  name: string;
  price: number;
  stock: number | null;
  unit: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function money(amount: number): string {
  return `S/${amount.toFixed(2)}`;
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

// ─── Templates ────────────────────────────────────────────────────────────────

/**
 * Menú de bienvenida con las 4 opciones principales.
 */
export function formatWelcomeMenu(businessName: string): string {
  return (
    `🏪 *${businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `¡Hola! Soy tu asistente de pedidos 👋\n\n` +
    `¿Qué deseas hacer?\n\n` +
    `1️⃣  *ver categorías* — Explorar por sección\n` +
    `2️⃣  *buscar [producto]* — Buscar algo específico\n` +
    `3️⃣  *mi carrito* — Ver lo que llevas\n` +
    `4️⃣  *hablar con humano* — Atención personalizada\n\n` +
    `_Escribe la opción o el número (ej: "1" o "buscar arroz")_`
  );
}

/**
 * Lista de categorías numerada.
 */
export function formatCategoryList(categories: string[]): string {
  if (categories.length === 0) {
    return "No hay categorías disponibles en este momento.";
  }
  const lines = categories.map((cat, i) => `${i + 1}. ${cat}`);
  return (
    `📂 *Categorías disponibles:*\n\n` +
    lines.join("\n") +
    `\n\n_Escribe el número o el nombre de la categoría que te interesa._`
  );
}

/**
 * Lista de productos con precio y stock.
 */
export function formatProductList(products: ProductEntry[], category?: string): string {
  if (products.length === 0) {
    return `No encontré productos${category ? ` en "${category}"` : ""}.\nEscribe *ver categorías* para explorar.`;
  }
  const header = category ? `🛍 *${category}*` : `🛍 *Productos encontrados:*`;
  const lines = products.map((p) => {
    const stockTag =
      p.stock == null
        ? ""
        : p.stock > 0
        ? ` ✅ ${p.stock} en stock`
        : " ⛔ Agotado";
    return `• *${p.name}* — ${money(p.price)} / ${p.unit}${stockTag}`;
  });
  return (
    `${header}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    lines.join("\n") +
    `\n━━━━━━━━━━━━━━━━━━━\n` +
    `_Escribe la cantidad y el nombre para agregar:\n` +
    `Ej: "2 coca cola" o "agregar 1 leche gloria"_`
  );
}

/**
 * Confirmación de producto agregado al carrito.
 */
export function formatItemAdded(item: CartItem, cartCount: number): string {
  return (
    `✅ *Agregado al carrito:*\n` +
    `${item.quantity} x ${item.name} — ${money(item.price * item.quantity)}\n\n` +
    `Tu carrito tiene ${cartCount} ${cartCount === 1 ? "producto" : "productos"}.\n\n` +
    `Escribe *mi carrito* para ver el resumen o sigue agregando productos.`
  );
}

/**
 * Resumen del carrito con total.
 */
export function formatCart(items: CartItem[], total: number): string {
  if (items.length === 0) {
    return `🛒 Tu carrito está vacío.\n\nEscribe *ver categorías* o *buscar [producto]* para empezar.`;
  }
  const lines = items.map(
    (i) =>
      `• ${i.quantity} x *${i.name}* (${i.unit}) — ${money(i.price * i.quantity)}`
  );
  return (
    `🛒 *Tu carrito:*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    lines.join("\n") +
    `\n━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Total: ${money(total)}*\n\n` +
    `Escribe *listo* para confirmar tu pedido\n` +
    `Escribe *cancelar* para vaciar el carrito\n` +
    `O sigue agregando más productos`
  );
}

/**
 * Solicitud de dirección de entrega.
 */
export function formatAskAddress(businessName: string, total: number): string {
  return (
    `🏪 *${businessName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Tu pedido:\n` +
    `💰 Total: *${money(total)}*\n\n` +
    `📍 *¿A dónde te lo enviamos?*\n` +
    `Escribe tu dirección de entrega.\n` +
    `Ej: "Jr. Ucayali 123, cerca al mercado"`
  );
}

/**
 * Confirmación de pedido creado en la DB.
 */
export function formatOrderConfirmation(
  orderId: string,
  items: CartItem[],
  total: number,
  address: string
): string {
  const lines = items.map(
    (i) => `  • ${i.quantity}x *${i.name}* — ${money(i.price * i.quantity)}`
  );
  return (
    `🎉 *¡Pedido confirmado!*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Pedido #${shortId(orderId)}\n\n` +
    lines.join("\n") +
    `\n\n💰 *Total: ${money(total)}*\n` +
    `📍 Entrega en: ${address}\n\n` +
    `Te contactaremos para coordinar la entrega. 🛵`
  );
}

/**
 * Instrucciones de pago Yape o efectivo.
 */
export function formatPaymentInstructions(
  total: number,
  yapeNumber: string | null | undefined
): string {
  const yapeSection = yapeNumber
    ? `📱 *Yape al:* ${yapeNumber}\n   Total a transferir: *${money(total)}*\n\n   Envíanos la captura de pantalla aquí mismo.\n`
    : "";
  return (
    `💳 *Opciones de pago:*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    yapeSection +
    `💵 *Efectivo:* Pagas al recibir tu pedido.\n\n` +
    `Total a pagar: *${money(total)}*`
  );
}

/**
 * Mensaje de redirección a humano.
 */
export function formatHumanHandoff(businessName: string): string {
  return (
    `👤 *Atención personalizada*\n\n` +
    `Un miembro del equipo de *${businessName}* te atenderá en breve.\n\n` +
    `Si es urgente, puedes llamarnos directamente. ¡Gracias por tu paciencia!`
  );
}

/**
 * Mensaje de error genérico.
 */
export function formatError(detail?: string): string {
  return (
    `⚠️ Ocurrió un problema${detail ? `: ${detail}` : ""}.\n` +
    `Por favor intenta de nuevo o escribe *hola* para volver al menú.`
  );
}

/**
 * Mensaje de producto no encontrado al intentar agregar al carrito.
 */
export function formatProductNotFound(term: string): string {
  return (
    `No encontré "*${term}*" en el catálogo.\n\n` +
    `Intenta con:\n` +
    `• *buscar ${term}* — búsqueda ampliada\n` +
    `• *ver categorías* — explorar todo\n` +
    `• *hablar con humano* — te ayudamos`
  );
}

/**
 * Mensaje de carrito vacío al escribir "listo".
 */
export function formatEmptyCartWarning(): string {
  return (
    `Tu carrito está vacío. Agrega productos antes de confirmar.\n\n` +
    `Escribe *ver categorías* o *buscar [producto]* para empezar.`
  );
}
