/**
 * Lo que el dueño cambia sin tocar los componentes: anuncios, portada, promos,
 * líneas, categorías y textos del pie de «Buleje Beauty».
 *
 * Reglas para que nada mienta:
 * · Precios, «antes» y % de descuento NO se escriben acá: salen de la base
 *   (precio de hoy + historial de precios). `{descuento}` en un texto se llena
 *   con el mayor % REAL del grupo; si no hay rebaja, esa línea no se muestra.
 * · Las categorías tienen que llamarse igual que en el panel (Productos).
 * · Fotos de ambiente: Unsplash (licencia Unsplash, uso comercial libre, sin
 *   marcas a la vista). Fuente de cada una en LEEME.md.
 */

/** Las categorías de belleza que muestra esta página (en este orden). El resto del catálogo no aparece. */
export const CATEGORIAS = [
  { nombre: "Shampoo", corto: "Shampoo" },
  { nombre: "Acondicionador", corto: "Acondicionador" },
  { nombre: "Tratamientos", corto: "Tratamientos" },
  { nombre: "Coloración", corto: "Coloración" },
  { nombre: "Styling", corto: "Styling" },
  { nombre: "Herramientas", corto: "Herramientas" },
  { nombre: "Kits", corto: "Kits" },
] as const;

export const CATEGORIA_SERVICIOS = "Servicios de salón";

/**
 * Franja de arriba. `{descuento}` = el mayor % real de toda la tienda;
 * `{pagos}` = los medios de pago prendidos en Ajustes. Sin dato, el aviso no sale.
 */
export const FRANJA = [
  "Hasta {descuento} % de descuento en productos seleccionados",
  "Reserva tu cita en el salón por WhatsApp",
  "Paga con {pagos}",
];

const u = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?w=${w}&q=70&auto=format&fit=crop`;

export interface Diapositiva {
  kicker: string;
  titulo: string;
  texto: string;
  cta: { texto: string; destino: Destino };
  cta2?: { texto: string; destino: Destino };
  foto: string;
  alt: string;
  /** Hacia dónde se recorta la foto en pantallas angostas. */
  enfoque: string;
  tono: "rubor" | "salvia" | "tinta";
}

/** Destino de un botón: una categoría o marca del catálogo, la búsqueda, los servicios o WhatsApp. */
export type Destino =
  | { categoria: string }
  | { buscar: string }
  | { ancla: "servicios" | "ofertas" }
  | { whatsapp: string };

export const PORTADA: Diapositiva[] = [
  {
    kicker: "Buleje Pro · Reparación Intensa",
    titulo: "El cuidado de salón, ahora en tu ducha",
    texto: "Shampoo, acondicionador y mascarilla con queratina vegetal para el cabello que sufre planchas y decoloración.",
    cta: { texto: "Comprar la línea", destino: { buscar: "Reparación Intensa" } },
    cta2: { texto: "Ver ofertas", destino: { ancla: "ofertas" } },
    foto: u("1500917293891-ef795e70e1f6", 1400),
    alt: "Mujer con cabello largo y ondulado sobre una pared rosa",
    enfoque: "50% 30%",
    tono: "rubor",
  },
  {
    kicker: "Rizos Libres · Nuevo",
    titulo: "Rizos definidos, sin frizz y sin sulfatos",
    texto: "Limpia, hidrata y da forma al rizo con una rutina de tres pasos pensada para el calor de la selva.",
    cta: { texto: "Descubrir Rizos Libres", destino: { buscar: "Rizos" } },
    cta2: { texto: "Ver styling", destino: { categoria: "Styling" } },
    foto: u("1519699047748-de8e457a634e", 1400),
    alt: "Mujer de cabello rizado y voluminoso sobre fondo nude",
    enfoque: "50% 35%",
    tono: "salvia",
  },
  {
    kicker: "Salón Buleje Beauty",
    titulo: "Tu próxima cita, a un mensaje",
    texto: "Corte, color, keratina, manicure y rituales de hidratación con nuestras estilistas.",
    cta: { texto: "Reservar por WhatsApp", destino: { whatsapp: "Hola, quiero reservar una cita en el salón." } },
    cta2: { texto: "Ver servicios", destino: { ancla: "servicios" } },
    foto: u("1521590832167-7bcbfaa6381f", 1400),
    alt: "Salón de belleza con sillones rosados frente a un espejo",
    enfoque: "50% 60%",
    tono: "tinta",
  },
];

/** Grilla de promos: la primera es la grande; las otras dos van apiladas. */
export interface Promo {
  kicker: string;
  titulo: string;
  /** Con `{descuento}`: se llena con el mayor % real del grupo; sin rebajas, no se muestra. */
  oferta: string;
  cta: string;
  grupo: { categoria: string } | { marca: string };
  /** Slugs de las imágenes de `public/demo/salon/` que se componen en el banner. */
  imagenes: string[];
  tono: "tinta" | "rubor" | "salvia";
}

export const PROMOS: Promo[] = [
  {
    kicker: "Herramientas profesionales",
    titulo: "Calor que cuida tu cabello",
    oferta: "Hasta {descuento} % dscto.",
    cta: "Ver herramientas",
    grupo: { categoria: "Herramientas" },
    imagenes: ["secadora-ionica-2200", "plancha-titanio-pro"],
    tono: "tinta",
  },
  {
    kicker: "Buleje Pro",
    titulo: "Rutina Reparación Intensa",
    oferta: "Hasta {descuento} % dscto.",
    cta: "Comprar",
    grupo: { marca: "Buleje Pro" },
    imagenes: ["kit-reparacion-intensa"],
    tono: "rubor",
  },
  {
    kicker: "Selva Botánica",
    titulo: "Aceites de la Amazonía",
    oferta: "Hasta {descuento} % dscto.",
    cta: "Comprar",
    grupo: { marca: "Selva Botánica" },
    imagenes: ["aceite-ungurahui"],
    tono: "salvia",
  },
];

/** Líneas con foto de ambiente + sus productos (por marca). */
export const LINEAS = [
  {
    marca: "Buleje Pro",
    kicker: "Línea profesional",
    titulo: "Buleje Pro",
    texto: "Fórmulas de salón para cabello dañado, con color o tratado con calor.",
    foto: u("1522337360788-8b13dee7a37e", 900),
    alt: "Mujer de espaldas con cabello largo castaño y brillante",
  },
  {
    marca: "Selva Botánica",
    kicker: "Línea natural",
    titulo: "Selva Botánica",
    texto: "Sacha inchi, ungurahui y aguaje: lo mejor de la Amazonía para nutrir y dar brillo.",
    foto: u("1617897903246-719242758050", 900),
    alt: "Frasco gotero de aceite capilar junto a una rama de eucalipto",
  },
] as const;

/** Banner oscuro: un servicio del salón (precio y duración salen de la base). */
export const BANNER_OSCURO = {
  servicio: "Alisado con keratina",
  kicker: "Ritual de salón",
  titulo: "Liso, brillo y cero frizz por meses",
  texto: "Keratina sin formol aplicada por nuestras estilistas, con diagnóstico previo y mascarilla de cierre.",
  foto: u("1634449571010-02389ed0f9b0", 1200),
  alt: "Estilista lavando el cabello de una clienta en el salón",
};

/** Foto que acompaña a los servicios. */
export const FOTO_SERVICIOS = {
  foto: u("1562322140-8baeececf3df", 900),
  alt: "Estilista secando con cepillo el cabello de una clienta",
};

/** Franja de beneficios. Que coincida con lo que el negocio cumple de verdad. */
export const BENEFICIOS = [
  { icono: "camion", titulo: "Delivery a domicilio", texto: "Pide desde aquí y recibe tu pedido en casa." },
  { icono: "pago", titulo: "Pago fácil", texto: "Paga con {pagos}." },
  { icono: "escudo", titulo: "Productos sellados", texto: "Nuestras líneas, con lote y fecha a la vista." },
  { icono: "chat", titulo: "Asesoría por WhatsApp", texto: "Te ayudamos a elegir la rutina para tu cabello." },
] as const;
