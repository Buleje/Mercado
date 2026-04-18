/**
 * lib/mock-faq.ts — Preguntas frecuentes mock para /ayuda.
 *
 * Stub sin backend. Estructura lista para migrar a CMS.
 * Categorias canonicas alineadas con las secciones de ayuda.
 */

export type FaqCategory =
  | "Pedidos"
  | "Pagos"
  | "Mi cuenta"
  | "Delivery"
  | "Devoluciones"
  | "Para tiendas";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: FaqCategory;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "1",
    question: "¿Cómo hago un pedido?",
    answer:
      "Entra a la tienda, agrega los productos que quieres al carrito con el botón verde. Cuando estés listo, presiona el carrito en la parte superior, revisa tu pedido y confirma. Puedes pagar con Yape, Plin o efectivo contra entrega.",
    category: "Pedidos",
  },
  {
    id: "2",
    question: "¿Cuánto demora el delivery?",
    answer:
      "El tiempo estimado es 30 a 60 minutos dependiendo de tu zona y la demanda del momento. Recibes un mensaje de WhatsApp cuando sale el repartidor con el link de seguimiento en tiempo real.",
    category: "Delivery",
  },
  {
    id: "3",
    question: "¿Qué métodos de pago aceptan?",
    answer:
      "Yape, Plin, efectivo contra entrega y transferencia bancaria. Cada bodega elige qué métodos activar, por lo que puede variar según la tienda. Los métodos disponibles se muestran antes de confirmar el pedido.",
    category: "Pagos",
  },
  {
    id: "4",
    question: "¿Cómo cancelo un pedido?",
    answer:
      "Puedes cancelar desde Mi Cuenta > Mis Pedidos si el estado es 'Pendiente'. Una vez que la tienda confirma el pedido, contacta directamente al soporte por WhatsApp para coordinar la cancelación.",
    category: "Pedidos",
  },
  {
    id: "5",
    question: "¿Puedo devolver un producto?",
    answer:
      "Si recibiste un producto dañado o incorrecto, escríbenos por WhatsApp dentro de las 24 horas siguientes a la entrega. Necesitamos una foto del producto y el número de tu pedido. Coordinamos el reemplazo o reembolso según el caso.",
    category: "Devoluciones",
  },
  {
    id: "6",
    question: "¿Cómo uso un cupón de descuento?",
    answer:
      "Agrega los productos al carrito, entra a Ver carrito y busca el campo '¿Tienes un cupón?'. Escribe el código y presiona Aplicar. El descuento se aplica inmediatamente antes de confirmar el pago.",
    category: "Pagos",
  },
  {
    id: "7",
    question: "¿La bodega está cerrada, puedo igual pedir?",
    answer:
      "No. Los pedidos solo se procesan cuando la tienda está activa. El horario de cada bodega se muestra en su página. Puedes activar una notificación para saber cuando abra de nuevo.",
    category: "Pedidos",
  },
  {
    id: "8",
    question: "¿Cómo me comunico con el repartidor?",
    answer:
      "Cuando sale tu pedido, recibes el link de seguimiento con la opción de llamar o escribirle por WhatsApp al repartidor directamente. También puedes hacerlo desde Mi Cuenta > Mis Pedidos > Ver detalle.",
    category: "Delivery",
  },
  {
    id: "9",
    question: "¿Cómo creo mi cuenta?",
    answer:
      "Al hacer tu primer pedido, se crea una cuenta automáticamente con tu número de celular. También puedes registrarte en /registro antes de comprar para tener tu perfil completo desde el inicio.",
    category: "Mi cuenta",
  },
  {
    id: "10",
    question: "¿Cómo registro mi bodega en Buleje?",
    answer:
      "Ve a /registro, elige el plan gratuito (sin costo inicial) y configura tu tienda con el asistente de onboarding. El proceso toma 5 minutos. Solo necesitas tu nombre, dirección y celular para empezar.",
    category: "Para tiendas",
  },
];

/** FAQ mas comunes — los primeros 8 para la sección principal de /ayuda */
export const FEATURED_FAQS = FAQ_ITEMS.slice(0, 8);

/** Agrupa los FAQ por categoria */
export function groupFaqByCategory(
  items: FaqItem[]
): Record<FaqCategory, FaqItem[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<FaqCategory, FaqItem[]>
  );
}
