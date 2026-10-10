/**
 * Lo que el dueño cambia sin tocar los componentes: anuncios, portada, promos,
 * categorías, «¿Qué quieres mejorar?», la garantía y los textos del pie de
 * «Musa» (belleza profesional en Ciudad Constitución).
 *
 * Reglas para que nada mienta:
 * · Precios, «antes» y % de descuento NO se escriben acá: salen de la base
 *   (precio de hoy + historial de precios). `{descuento}` en un texto se llena
 *   con el mayor % REAL del grupo; si no hay rebaja, esa línea no se muestra.
 * · Las categorías tienen que llamarse igual que en el panel (Productos).
 * · Voz de Musa: tuteo, «ayuda a» (nunca «cura»), asesoría de Drucila.
 * · Fotos de ambiente: Unsplash (licencia Unsplash, uso comercial libre, sin
 *   marcas a la vista). Fuente de cada una en LEEME.md.
 */

/** Las categorías de Musa, en el orden del menú (iguales al panel). */
export const CATEGORIAS = [
  { nombre: "Cabello", corto: "Cabello", texto: "Shampoo sin sal, mascarillas, aceites y tónicos que ayudan a cuidar el cabello del sol y la humedad de la selva." },
  { nombre: "Rostro", corto: "Rostro", texto: "Limpiador, sérums y protector FPS 50: una rutina simple que ayuda a tu piel a verse pareja y luminosa." },
  { nombre: "Cuerpo", corto: "Cuerpo", texto: "Cremas, aceites y protector para la piel del cuerpo, pensados para el clima de la selva." },
  { nombre: "Kits y ofertas", corto: "Kits y ofertas", texto: "Las rutinas completas en una caja: ahorras frente a comprar cada producto y son el regalo perfecto." },
] as const;

export const BUSQUEDAS_SUGERIDAS = ["Shampoo sin sal", "Vitamina C", "FPS 50", "Argán", "Kit"];

/** Musa no tiene servicios en la tienda: la categoría queda por compatibilidad (sin productos, no sale nada). */
export const CATEGORIA_SERVICIOS = "Servicios";

export const FRANJA = [
  "Envío gratis en Ciudad Constitución",
  "Asesoría gratis con Drucila por WhatsApp: 921 585 006",
  "Diagnóstico gratis los sábados",
  "Hasta {descuento} % de descuento en productos seleccionados",
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

export type Destino =
  | { categoria: string }
  | { buscar: string }
  | { ancla: "servicios" | "ofertas" | "mejorar" }
  | { whatsapp: string };

export const PORTADA: Diapositiva[] = [
  {
    kicker: "Campaña Navidad · Kits desde S/ 125",
    titulo: "Regala belleza profesional",
    texto: "Cuidado profesional para tu cabello, rostro y piel, con asesoría de verdad y entrega en tu puerta.",
    cta: { texto: "Ver kits de regalo", destino: { categoria: "Kits y ofertas" } },
    cta2: { texto: "¿Qué quieres mejorar?", destino: { ancla: "mejorar" } },
    foto: u("1519699047748-de8e457a634e", 1400),
    alt: "Mujer de cabello rizado y voluminoso sobre fondo nude",
    enfoque: "50% 35%",
    tono: "tinta",
  },
  {
    kicker: "Asesoría gratis",
    titulo: "Te recomiendo solo lo que te sirve",
    texto: "Escríbele a Drucila por WhatsApp: te pregunta por tu piel o tu cabello y te arma la rutina a tu medida.",
    cta: { texto: "Escribir a Drucila", destino: { whatsapp: "Hola Drucila, quiero asesoría para elegir mis productos." } },
    cta2: { texto: "Ver rostro", destino: { categoria: "Rostro" } },
    foto: u("1617897903246-719242758050", 1400),
    alt: "Frasco gotero de sérum junto a una rama verde",
    enfoque: "50% 50%",
    tono: "rubor",
  },
  {
    kicker: "Cabello de salón en casa",
    titulo: "Hecho para el sol y la humedad de la selva",
    texto: "Shampoo sin sal, mascarilla y aceite de argán que ayudan a tu cabello a verse suave, con brillo y sin frizz.",
    cta: { texto: "Ver cabello", destino: { categoria: "Cabello" } },
    cta2: { texto: "Ver ofertas", destino: { ancla: "ofertas" } },
    foto: u("1522337360788-8b13dee7a37e", 1400),
    alt: "Mujer de espaldas con cabello largo castaño y brillante",
    enfoque: "50% 30%",
    tono: "salvia",
  },
];

export interface Promo {
  kicker: string;
  titulo: string;
  /** Con `{descuento}`: se llena con el mayor % real del grupo; sin rebajas, no se muestra. */
  oferta: string;
  cta: string;
  grupo: { categoria: string } | { marca: string };
  /** Slugs de imágenes de `public/demo/salon/` para el banner (Musa no usa: sin imágenes de terceros). */
  imagenes: string[];
  tono: "tinta" | "rubor" | "salvia";
}

export const PROMOS: Promo[] = [
  { kicker: "Kits en caja", titulo: "Regalos que se usan de verdad", oferta: "Hasta {descuento} % dscto.", cta: "Ver kits", grupo: { categoria: "Kits y ofertas" }, imagenes: [], tono: "tinta" },
  { kicker: "Rostro", titulo: "Tu rutina de tres pasos", oferta: "Hasta {descuento} % dscto.", cta: "Ver rostro", grupo: { categoria: "Rostro" }, imagenes: [], tono: "rubor" },
  { kicker: "Cabello", titulo: "Adiós al frizz de la selva", oferta: "Hasta {descuento} % dscto.", cta: "Ver cabello", grupo: { categoria: "Cabello" }, imagenes: [], tono: "salvia" },
];

/** Líneas propias por marca: Musa vende por necesidad, no por marca (sin líneas, la sección no sale). */
export const LINEAS: readonly { marca: string; kicker: string; titulo: string; texto: string; foto: string; alt: string }[] = [];

export const BANNER_OSCURO = {
  kicker: "Todos los sábados",
  titulo: "Diagnóstico gratis de piel y cabello",
  texto: "Ven o escríbenos: Drucila revisa tu piel o tu cabello, te dice qué necesita y te arma la rutina. Sin compromiso de compra.",
  mensaje: "Hola Drucila, quiero separar mi diagnóstico gratis del sábado.",
  foto: u("1500917293891-ef795e70e1f6", 1200),
  alt: "Mujer con cabello largo y ondulado sobre una pared rosa",
};

/** «¿Qué quieres mejorar?» (como el índice del catálogo): cada tarjeta lleva a su categoría o búsqueda. */
export const MEJORAR = [
  { icono: "manchas", titulo: "Manchas", texto: "Vitamina C + protector", destino: { buscar: "manchas" } },
  { icono: "granitos", titulo: "Granitos y brillo", texto: "Niacinamida y limpiador", destino: { buscar: "niacinamida" } },
  { icono: "seca", titulo: "Piel seca", texto: "Ácido hialurónico", destino: { buscar: "hialurónico" } },
  { icono: "ojeras", titulo: "Ojeras y bolsas", texto: "Contorno de ojos", destino: { buscar: "contorno" } },
  { icono: "frizz", titulo: "Frizz y puntas", texto: "Aceite de argán", destino: { buscar: "frizz" } },
  { icono: "caida", titulo: "Caída", texto: "Tónico anticaída", destino: { buscar: "anticaída" } },
  { icono: "danado", titulo: "Cabello dañado", texto: "Mascarilla y plex", destino: { categoria: "Cabello" } },
  { icono: "sol", titulo: "Sol de la selva", texto: "Protectores FPS 50", destino: { buscar: "FPS 50" } },
  { icono: "regalos", titulo: "Regalos", texto: "Kits en caja", destino: { categoria: "Kits y ofertas" } },
  { icono: "cuerpo", titulo: "Piel del cuerpo", texto: "Crema y exfoliante", destino: { categoria: "Cuerpo" } },
] as const satisfies readonly { icono: string; titulo: string; texto: string; destino: Destino }[];

/** «Tu compra está protegida»: la garantía de Musa, tal como la dice el manual. */
export const PROTEGIDA = [
  { icono: "cambio", titulo: "Cambio sin costo", texto: "Si te llega dañado, vencido o equivocado, te lo cambiamos sin costo." },
  { icono: "foto", titulo: "Avísanos en 7 días", texto: "Escríbenos por WhatsApp con una foto del producto dentro de los 7 días." },
  { icono: "devolucion", titulo: "Devolución en 48 h", texto: "Si corresponde, te devolvemos tu dinero por Yape en 48 horas." },
  { icono: "abierto", titulo: "Lo abierto no se devuelve", texto: "Salvo que tenga una falla: por higiene, lo usado no vuelve a la tienda." },
  { icono: "original", titulo: "Productos originales", texto: "Todos con su Notificación Sanitaria Obligatoria (NSO) a la vista." },
] as const;

export const BENEFICIOS = [
  { icono: "camion", titulo: "Envío gratis en Constitución", texto: "Fuera de Constitución, gratis desde S/ 99 (Villa Rica, Oxapampa, Puerto Bermúdez)." },
  { icono: "pago", titulo: "Paga como prefieras", texto: "Yape, Plin, transferencia o contraentrega en Constitución." },
  { icono: "escudo", titulo: "Tu compra está protegida", texto: "Cambio sin costo si llega dañado, vencido o equivocado." },
  { icono: "chat", titulo: "Asesoría gratis", texto: "Drucila te ayuda a elegir por WhatsApp: 921 585 006." },
] as const;
