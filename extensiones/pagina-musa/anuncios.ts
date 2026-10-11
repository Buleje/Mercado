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

/**
 * La franja de arriba: rota de a uno (el S/ 99 es la regla de envío, no un precio).
 * Cada mensaje cabe en UNA línea a 400 px (≤ 48 letras): la franja mide lo del más
 * largo, y uno de 50 la subía a dos líneas en el celular.
 * La preventa va con las palabras del manual (Campaña 01: «preventa 10 % a las primeras
 * 20 clientas»; Navidad: «Preventa desde el 16 nov (se separa con S/ 20) · envíos a
 * provincia hasta el 18 dic»), nada más. `{preventa}`, `{navidad}` y `{provincia}` valen ""
 * mientras dura cada cosa y null después (`valoresCampana` en preventa.ts).
 */
export const FRANJA = [
  "{preventa}Preventa: 10 % a las primeras 20 clientas",
  "{navidad}Navidad: separa tu kit con S/ 20 desde el 16/11",
  "Envío gratis en Ciudad Constitución",
  "Fuera de Constitución, envío gratis desde S/ 99",
  "{provincia}Envíos a provincia para Navidad: hasta el 18/12",
  "Asesoría gratis por WhatsApp: 921 585 006",
  "Diagnóstico gratis de piel y cabello los sábados",
  "Productos con hasta {descuento} % de descuento",
];

const u = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?w=${w}&q=70&auto=format&fit=crop`;

export interface Diapositiva {
  kicker: string;
  titulo: string;
  /** La línea script (Great Vibes, ≤3 palabras) encimada bajo el titular, como «esta Navidad» en la tapa del catálogo. */
  script?: string;
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

/**
 * El héroe de la portada: UNO solo, comprable (contrato §e), como la tapa del
 * catálogo de la Campaña 01. Sin precios escritos: «Kits desde S/ X» sale de
 * la base. La asesoría (antes 2.ª diapositiva) pasó a «Hola, linda» (`CARTA`).
 */
export const PORTADA: Diapositiva[] = [
  {
    kicker: "Campaña 01 · Nov–Dic 2026",
    titulo: "Regala belleza profesional",
    script: "esta Navidad",
    texto: "Cuidado profesional para tu cabello, rostro y piel, con asesoría de verdad y entrega en tu puerta.",
    cta: { texto: "Ver kits de regalo", destino: { categoria: "Kits y ofertas" } },
    cta2: { texto: "¿Qué quieres mejorar?", destino: { ancla: "mejorar" } },
    foto: u("1519699047748-de8e457a634e", 1400),
    alt: "Mujer de cabello rizado y voluminoso sobre fondo nude",
    enfoque: "50% 35%",
    tono: "tinta",
  },
];

/** «Hola, linda»: la carta de Drucila de la página 2 del catálogo (firma en script, como lo impreso). */
export const CARTA = {
  saludo: "Hola, linda",
  parrafos: [
    "Soy Drucila, tu asesora de belleza. Elegí cada producto de esta tienda pensando en el clima de nuestra selva: el sol fuerte, la humedad que esponja el cabello y la piel que necesita hidratación.",
    "Antes de comprar, escríbeme: te pregunto por tu piel o tu cabello y te recomiendo solo lo que te sirve. Y a los 15 días te escribo para ver cómo vas.",
  ],
  firma: "Drucila",
  cargo: "Tu asesora Musa",
  boton: "Escribir a Drucila",
  mensaje: "Hola Drucila, quiero asesoría para elegir mis productos.",
} as const;

/** Atención (manual §10): lo repiten el pie y la carta. */
export const CONTACTO = {
  telefono: "921 585 006",
  horario: "Lunes a sábado, de 9:00 a 20:00",
  lugar: "Ciudad Constitución, Pasco",
  fueraDeHorario: "Fuera de horario, déjanos tu consulta y mañana temprano te respondemos.",
} as const;

/** Cómo se paga (manual): `metodo` elige el ícono de `PaymentMethodIcon` (arte propio del DS). */
export const PAGOS = [
  { metodo: "yape", texto: "Yape" },
  { metodo: "plin", texto: "Plin" },
  { metodo: "transferencia", texto: "Transferencia" },
  { metodo: "efectivo", texto: "Contraentrega en Constitución" },
] as const;

/** La despedida del pie: script + la firma del manual. */
export const DESPEDIDA = { script: "gracias, linda", firma: "— Drucila, tu asesora de belleza" } as const;

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
