/**
 * lib/store-sections-types.ts
 *
 * Tipos compartidos del Sections Builder de la pagina publica del tenant.
 *
 * El bodeguero arma su `/t/[slug]` agregando secciones desde 6 plantillas
 * pre-elaboradas. Cada seccion tiene su shape de datos tipado.
 *
 * Persistencia: por ahora se guarda como JSON en el campo
 * `TenantStorePage.footerHtml` con prefix `__SECTIONS__::` para no requerir
 * migration de Prisma. TODO mayo 2026 v3: migrar a columna `sectionsJson`
 * dedicada en TenantStorePage.
 *
 * Render: ver components/store/tenant/SectionRenderer.tsx
 */

export type SectionType =
  | "about"
  | "hours"
  | "payment"
  | "how-to-order"
  | "faq"
  | "benefits"
  | "gallery"
  | "image-text"
  // Bloques nuevos (Brandon 2026-06-27 · #2)
  | "cta"
  | "video"
  | "map"
  | "logos"
  | "countdown"
  // Lote A (Brandon 2026-06-27)
  | "team"
  | "social"
  // Lote B (Brandon 2026-06-27)
  | "categories";

export interface SectionBase {
  id: string;
  type: SectionType;
  visible: boolean;
  /** Posicion en la pagina (0 = primero arriba). */
  order: number;
}

// ── About ──────────────────────────────────────────────────────────────
export interface AboutSection extends SectionBase {
  type: "about";
  data: {
    title: string;
    body: string;
    imageUrl?: string;
  };
}

// ── Horarios ───────────────────────────────────────────────────────────
export interface HoursSection extends SectionBase {
  type: "hours";
  data: {
    title: string;
    note?: string;
    schedule: Array<{
      day: "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";
      open: boolean;
      from?: string; // "08:00"
      to?: string; // "20:00"
    }>;
  };
}

// ── Metodos de pago ────────────────────────────────────────────────────
export interface PaymentSection extends SectionBase {
  type: "payment";
  data: {
    title: string;
    subtitle?: string;
    methods: Array<{
      id: "yape" | "plin" | "efectivo" | "tarjeta" | "transferencia";
      label: string;
      enabled: boolean;
    }>;
  };
}

// ── Como pedir ─────────────────────────────────────────────────────────
export interface HowToOrderSection extends SectionBase {
  type: "how-to-order";
  data: {
    title: string;
    subtitle?: string;
    steps: Array<{
      title: string;
      description: string;
    }>;
  };
}

// ── FAQ ────────────────────────────────────────────────────────────────
export interface FaqSection extends SectionBase {
  type: "faq";
  data: {
    title: string;
    items: Array<{
      question: string;
      answer: string;
    }>;
  };
}

// ── Beneficios ─────────────────────────────────────────────────────────
export interface BenefitsSection extends SectionBase {
  type: "benefits";
  data: {
    title: string;
    items: Array<{
      icon: "truck" | "shield" | "clock" | "tag" | "heart" | "sparkles";
      title: string;
      description: string;
    }>;
  };
}

// ── Galeria ────────────────────────────────────────────────────────────
export interface GallerySection extends SectionBase {
  type: "gallery";
  data: {
    title: string;
    subtitle?: string;
    images: Array<{
      url: string;
      alt?: string;
      caption?: string;
    }>;
    /** Lote I (Brandon 2026-06-27): columnas del grid. Default = auto por cantidad. */
    columns?: 2 | 3 | 4;
  };
}

// ── Imagen + Texto (split hero) ───────────────────────────────────────
export interface ImageTextSection extends SectionBase {
  type: "image-text";
  data: {
    title: string;
    body: string;
    imageUrl: string;
    imageAlt?: string;
    /** Lado de la imagen — left | right | top | bottom (Lote I). */
    imagePosition: "left" | "right" | "top" | "bottom";
    /** Fondo del bloque — claro | marca (gradiente primary→accent) | oscuro. */
    background?: "light" | "brand" | "dark";
    /** Etiqueta superior (eyebrow) editable. */
    eyebrow?: string;
    /** CTA opcional. */
    ctaLabel?: string;
    ctaUrl?: string;
  };
}

// ── Banner CTA grande ──────────────────────────────────────────────────
export interface CtaSection extends SectionBase {
  type: "cta";
  data: {
    title: string;
    subtitle?: string;
    buttonLabel: string;
    buttonUrl: string;
    /** Fondo del bloque — marca (gradiente), oscuro o claro. */
    background?: "brand" | "dark" | "light";
  };
}

// ── Video (YouTube o MP4) ──────────────────────────────────────────────
export interface VideoSection extends SectionBase {
  type: "video";
  data: {
    title?: string;
    subtitle?: string;
    /** URL de YouTube (watch/youtu.be) o archivo .mp4. */
    videoUrl: string;
  };
}

// ── Mapa de ubicación ──────────────────────────────────────────────────
export interface MapSection extends SectionBase {
  type: "map";
  data: {
    title?: string;
    address: string;
  };
}

// ── Franja de logos / marcas ───────────────────────────────────────────
export interface LogosSection extends SectionBase {
  type: "logos";
  data: {
    title?: string;
    logos: Array<{ url: string; alt?: string }>;
  };
}

// ── Contador de oferta (countdown) ─────────────────────────────────────
export interface CountdownSection extends SectionBase {
  type: "countdown";
  data: {
    title: string;
    subtitle?: string;
    /** ISO date string (fin de la oferta). */
    endsAt: string;
  };
}

// ── Nuestro equipo ─────────────────────────────────────────────────────
export interface TeamSection extends SectionBase {
  type: "team";
  data: {
    title: string;
    subtitle?: string;
    members: Array<{ name: string; role?: string; photo?: string }>;
  };
}

// ── Redes sociales ─────────────────────────────────────────────────────
export interface SocialSection extends SectionBase {
  type: "social";
  data: {
    title?: string;
    links: Array<{ platform: "instagram" | "facebook" | "tiktok" | "whatsapp" | "web"; url: string }>;
  };
}

// ── Categorías visual (grid de tarjetas con imagen) ────────────────────
export interface CategoriesSection extends SectionBase {
  type: "categories";
  data: {
    title: string;
    subtitle?: string;
    items: Array<{ name: string; image?: string; url?: string }>;
  };
}

export type Section =
  | AboutSection
  | HoursSection
  | PaymentSection
  | HowToOrderSection
  | FaqSection
  | BenefitsSection
  | GallerySection
  | ImageTextSection
  | CtaSection
  | VideoSection
  | MapSection
  | LogosSection
  | CountdownSection
  | TeamSection
  | SocialSection
  | CategoriesSection;

// ── Plantillas pre-armadas con copy real ───────────────────────────────

export interface SectionTemplate {
  type: SectionType;
  label: string;
  emoji: string;
  description: string;
  /** Tag visual (chip de categoria). */
  tag: "informacion" | "operaciones" | "trust" | "soporte";
  /** Factory que crea una nueva seccion del tipo con data inicial. */
  create: () => Omit<Section, "id" | "order">;
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    type: "about",
    label: "Sobre Nosotros",
    emoji: "📖",
    description: "Cuenta tu historia: cuándo abriste, qué te hace especial, por qué los vecinos te eligen.",
    tag: "informacion",
    create: () => ({
      type: "about",
      visible: true,
      data: {
        title: "Sobre nosotros",
        body: "Somos un negocio familiar con años atendiendo al barrio. Cuidamos cada pedido como si fuera el de nuestra casa. Frescura, atención cercana y delivery confiable son nuestra marca.",
        imageUrl: "",
      },
    }),
  },
  {
    type: "hours",
    label: "Horarios de atención",
    emoji: "🕐",
    description: "Los días y horas que trabajás. El cliente sabe cuándo puede pedir sin sorpresas.",
    tag: "operaciones",
    create: () => ({
      type: "hours",
      visible: true,
      data: {
        title: "Horarios de atención",
        note: "Pedidos por WhatsApp todos los días.",
        schedule: [
          { day: "lun", open: true, from: "08:00", to: "20:00" },
          { day: "mar", open: true, from: "08:00", to: "20:00" },
          { day: "mie", open: true, from: "08:00", to: "20:00" },
          { day: "jue", open: true, from: "08:00", to: "20:00" },
          { day: "vie", open: true, from: "08:00", to: "21:00" },
          { day: "sab", open: true, from: "09:00", to: "21:00" },
          { day: "dom", open: false },
        ],
      },
    }),
  },
  {
    type: "payment",
    label: "Métodos de pago",
    emoji: "💳",
    description: "Qué medios aceptás: Yape, Plin, efectivo, tarjeta o transferencia.",
    tag: "operaciones",
    create: () => ({
      type: "payment",
      visible: true,
      data: {
        title: "Cómo podés pagar",
        subtitle: "Eligés vos al confirmar el pedido. Sin sorpresas.",
        methods: [
          { id: "yape", label: "Yape", enabled: true },
          { id: "plin", label: "Plin", enabled: true },
          { id: "efectivo", label: "Efectivo al recibir", enabled: true },
          { id: "tarjeta", label: "Tarjeta (online)", enabled: false },
          { id: "transferencia", label: "Transferencia", enabled: false },
        ],
      },
    }),
  },
  {
    type: "how-to-order",
    label: "Cómo pedir",
    emoji: "🛒",
    description: "Explica el flujo de pedido en 3 pasos. Útil para clientes nuevos que dudan.",
    tag: "soporte",
    create: () => ({
      type: "how-to-order",
      visible: true,
      data: {
        title: "Tu pedido en 3 pasos",
        subtitle: "Sin app, sin trámites. Desde el celular.",
        steps: [
          {
            title: "Elegís lo que querés",
            description: "Mirás el catálogo y agregás todo al carrito. Vas viendo el total real.",
          },
          {
            title: "Confirmás cómo pagás",
            description: "Yape, Plin o efectivo al recibir. Tu eliges.",
          },
          {
            title: "Recibís en tu puerta",
            description: "El motorizado llega en 25-35 minutos a tu zona.",
          },
        ],
      },
    }),
  },
  {
    type: "faq",
    label: "Preguntas frecuentes",
    emoji: "❓",
    description: "Acordeón con las dudas típicas (tiempo, zona de entrega, vuelto, devoluciones).",
    tag: "soporte",
    create: () => ({
      type: "faq",
      visible: true,
      data: {
        title: "Preguntas frecuentes",
        items: [
          {
            question: "¿Cuánto tarda el delivery?",
            answer: "Entre 25 y 35 minutos en zonas cercanas. Si vivís más lejos te avisamos antes.",
          },
          {
            question: "¿A qué zonas hacen delivery?",
            answer: "Cubrimos toda Pucallpa. Si tu zona queda lejos, te coordinamos por WhatsApp.",
          },
          {
            question: "¿Puedo pagar con efectivo y necesito vuelto?",
            answer: "Sí. Al confirmar el pedido decís cuánto vas a entregar y preparamos el vuelto exacto.",
          },
          {
            question: "¿Qué pasa si no me gusta lo que recibí?",
            answer: "Nos avisás al toque por WhatsApp y lo solucionamos: cambio, reembolso o crédito a tu favor.",
          },
        ],
      },
    }),
  },
  {
    type: "benefits",
    label: "Beneficios / Por qué elegirnos",
    emoji: "✨",
    description: "3-4 cards con iconos que destacan tus ventajas (rapidez, calidad, atención, etc).",
    tag: "trust",
    create: () => ({
      type: "benefits",
      visible: true,
      data: {
        title: "Por qué nos eligen",
        items: [
          {
            icon: "truck",
            title: "Delivery rápido",
            description: "25-35 min promedio. Motorizado propio que cuida tu pedido.",
          },
          {
            icon: "shield",
            title: "Productos frescos",
            description: "Cuidamos la cadena de frío. Si algo no está bien, lo cambiamos sin preguntar.",
          },
          {
            icon: "heart",
            title: "Atención cercana",
            description: "Hablás con personas reales por WhatsApp, no con bots.",
          },
        ],
      },
    }),
  },
  {
    type: "gallery",
    label: "Galería de fotos",
    emoji: "📸",
    description: "Grid de 4 a 8 fotos del local, productos o equipo. Genera confianza visual.",
    tag: "informacion",
    create: () => ({
      type: "gallery",
      visible: true,
      data: {
        title: "Conocé nuestro lugar",
        subtitle: "Fotos reales del local, productos y equipo.",
        images: [
          { url: "", alt: "Foto del local" },
          { url: "", alt: "Producto destacado" },
          { url: "", alt: "Nuestro equipo" },
          { url: "", alt: "Cocina en acción" },
        ],
      },
    }),
  },
  {
    type: "image-text",
    label: "Imagen + texto (hero secundario)",
    emoji: "🖼️",
    description: "Bloque editorial split: foto a un lado + título y descripción al otro. Estilo Apple/Airbnb.",
    tag: "informacion",
    create: () => ({
      type: "image-text",
      visible: true,
      data: {
        title: "Nuestra historia",
        body: "Hace 10 años abrimos con un sueño: que el barrio tenga lo mejor a un toque. Hoy seguimos cuidando cada pedido como si fuera el primero.",
        imageUrl: "",
        imageAlt: "Foto del negocio",
        imagePosition: "right",
        background: "brand",
        eyebrow: "Nuestra historia",
        ctaLabel: "Conocenos más",
        ctaUrl: "",
      },
    }),
  },
  // ── Bloques nuevos (Brandon 2026-06-27 · #2) ──────────────────────────
  {
    type: "cta",
    label: "Banner de acción",
    emoji: "🎯",
    description: "Una franja grande con un mensaje y un botón — ideal para 'Pedí ahora' o una promo.",
    tag: "operaciones",
    create: () => ({
      type: "cta",
      visible: true,
      data: {
        title: "¿Listo para tu pedido?",
        subtitle: "Escribinos y te atendemos al toque.",
        buttonLabel: "Pedir ahora",
        buttonUrl: "",
        background: "brand",
      },
    }),
  },
  {
    type: "video",
    label: "Video",
    emoji: "🎬",
    description: "Mostrá un video de YouTube o un .mp4 — tu local, cómo cocinás, una reseña.",
    tag: "informacion",
    create: () => ({
      type: "video",
      visible: true,
      data: { title: "Mirá nuestro video", subtitle: "", videoUrl: "" },
    }),
  },
  {
    type: "map",
    label: "Mapa de ubicación",
    emoji: "📍",
    description: "Un mapa con tu dirección para que te encuentren fácil.",
    tag: "informacion",
    create: () => ({
      type: "map",
      visible: true,
      data: { title: "Dónde estamos", address: "" },
    }),
  },
  {
    type: "logos",
    label: "Marcas / logos",
    emoji: "🏷️",
    description: "Franja con logos de marcas que vendés o aliados — genera confianza.",
    tag: "trust",
    create: () => ({
      type: "logos",
      visible: true,
      data: { title: "Trabajamos con", logos: [] },
    }),
  },
  {
    type: "countdown",
    label: "Cuenta regresiva",
    emoji: "⏳",
    description: "Un contador hasta el fin de una oferta — crea urgencia.",
    tag: "operaciones",
    create: () => ({
      type: "countdown",
      visible: true,
      data: { title: "¡Oferta por tiempo limitado!", subtitle: "", endsAt: "" },
    }),
  },
  // ── Lote A (Brandon 2026-06-27) ──────────────────────────────────────
  {
    type: "team",
    label: "Nuestro equipo",
    emoji: "👥",
    description: "Mostrá las caras del negocio: foto, nombre y rol. Genera cercanía.",
    tag: "trust",
    create: () => ({
      type: "team",
      visible: true,
      data: {
        title: "Nuestro equipo",
        subtitle: "Las personas detrás de la atención",
        members: [
          { name: "Nombre Apellido", role: "Dueño/a", photo: "" },
          { name: "Nombre Apellido", role: "Atención", photo: "" },
        ],
      },
    }),
  },
  {
    type: "social",
    label: "Redes sociales",
    emoji: "📲",
    description: "Links grandes a tus redes para que te sigan.",
    tag: "soporte",
    create: () => ({
      type: "social",
      visible: true,
      data: {
        title: "Seguinos en redes",
        links: [
          { platform: "instagram", url: "" },
          { platform: "facebook", url: "" },
        ],
      },
    }),
  },
  {
    type: "categories",
    label: "Categorías visual",
    emoji: "🗂️",
    description: "Grid de categorías con imagen de fondo — atajos visuales a tu catálogo.",
    tag: "operaciones",
    create: () => ({
      type: "categories",
      visible: true,
      data: {
        title: "Explorá por categoría",
        subtitle: "",
        items: [
          { name: "Categoría 1", image: "", url: "" },
          { name: "Categoría 2", image: "", url: "" },
          { name: "Categoría 3", image: "", url: "" },
        ],
      },
    }),
  },
];

// ── Storage helpers ────────────────────────────────────────────────────

const STORAGE_PREFIX = "__SECTIONS__::";

/** Serializa la lista de secciones para guardar en footerHtml. */
export function serializeSections(sections: Section[]): string {
  return STORAGE_PREFIX + JSON.stringify(sections);
}

/** Lee la lista de secciones desde footerHtml. Retorna [] si no hay. */
export function deserializeSections(raw: string | null | undefined): Section[] {
  if (!raw || !raw.startsWith(STORAGE_PREFIX)) return [];
  try {
    const parsed = JSON.parse(raw.slice(STORAGE_PREFIX.length));
    if (!Array.isArray(parsed)) return [];
    return parsed as Section[];
  } catch {
    return [];
  }
}

/** Tag visual segun el chip categoria. */
export const SECTION_TAG_STYLES: Record<SectionTemplate["tag"], string> = {
  informacion: "bg-[var(--accent-soft)] text-[var(--accent)]",
  operaciones: "bg-[var(--data-warning-50,#fffbeb)] text-[var(--data-warning-700,#b45309)]",
  trust: "bg-[var(--data-success-50,#ecfdf5)] text-[var(--data-success-700,#047857)]",
  soporte: "bg-violet-100 text-[var(--accent)] dark:bg-violet-950/40 dark:text-[var(--accent)]",
};
