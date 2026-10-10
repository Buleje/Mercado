// Respuestas rápidas del inbox WhatsApp — single source compartida con
// WhatsAppTemplates (sub-tab Plantillas WhatsApp). Las custom viven en
// localStorage (misma key que usa el editor de plantillas).

export type QuickReply = {
  id: string;
  nombre: string;
  texto: string;
  variables: string[];
  custom?: boolean;
};

export const QUICK_REPLIES_LS_KEY = "buleje-whatsapp-templates";

export const PREDEFINED_QUICK_REPLIES: QuickReply[] = [
  {
    id: "cobro-fiado",
    nombre: "Cobrar fiado",
    texto: "Hola {nombre}, te recordamos que tienes un pendiente de S/{monto} en Buleje. ¿Cuándo puedes pasar? 😊",
    variables: ["nombre", "monto"],
  },
  {
    id: "confirmar-pedido",
    nombre: "Confirmar pedido",
    texto: "✅ Hola {nombre}, tu pedido #{pedido} ha sido confirmado. Lo tendremos listo pronto. 🛒",
    variables: ["nombre", "pedido"],
  },
  {
    id: "saludo",
    nombre: "Saludo",
    texto: "¡Hola {nombre}! 👋 Gracias por escribirnos. ¿En qué te puedo ayudar?",
    variables: ["nombre"],
  },
  {
    id: "en-camino",
    nombre: "Pedido en camino",
    texto: "🛵 {nombre}, ¡tu pedido va en camino! Llega en unos minutos.",
    variables: ["nombre"],
  },
  {
    id: "cumpleanos",
    nombre: "Feliz cumpleaños",
    texto: "🎂 ¡Feliz cumpleaños {nombre}! Te regalamos un 10% de descuento. Usa el código: CUMPLE-{codigo}. ¡Te esperamos! 🎁",
    variables: ["nombre", "codigo"],
  },
  {
    id: "reactivacion",
    nombre: "Reactivar cliente",
    texto: "Hola {nombre}, ¡te extrañamos! Tenemos ofertas especiales esperándote en Buleje. ¡Visítanos! 🛍",
    variables: ["nombre"],
  },
  {
    id: "stock-disponible",
    nombre: "Producto disponible",
    texto: "📦 Hola {nombre}, {producto} ya está disponible en Buleje. ¡No te quedes sin el tuyo! 🏃",
    variables: ["nombre", "producto"],
  },
  {
    id: "agradecimiento",
    nombre: "Agradecimiento",
    texto: "🙏 Hola {nombre}, gracias por tu compra de hoy (S/{monto}). ¡Vuelve pronto a Buleje! 😊",
    variables: ["nombre", "monto"],
  },
  {
    id: "horario",
    nombre: "Horario de atención",
    texto: "🕐 Nuestro horario de atención es de lunes a domingo. ¡Te esperamos, {nombre}!",
    variables: ["nombre"],
  },
];

/** Custom guardadas por el editor de Plantillas WhatsApp (localStorage). */
export function loadCustomQuickReplies(): QuickReply[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUICK_REPLIES_LS_KEY);
    return raw ? (JSON.parse(raw) as QuickReply[]) : [];
  } catch {
    return [];
  }
}

/** Reemplaza {nombre} con el cliente real; deja las demás {vars} para editar. */
export function renderQuickReply(texto: string, customerName?: string): string {
  if (!customerName || customerName === "Cliente") return texto;
  return texto.replaceAll("{nombre}", customerName);
}
