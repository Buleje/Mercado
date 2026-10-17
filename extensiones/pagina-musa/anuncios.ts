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
 * La barra de bienvenida (`FranjaAnuncio`): UNA línea fija, sin rotar. En el
 * celular sale el primer mensaje vigente; desde 640 px, los dos primeros. Cada
 * mensaje cabe en UNA línea a 400 px (≤ 48 letras). Lo de campaña va primero
 * mientras dura y desaparece solo: `{preventa}` vale "" hasta el 31-12 y null
 * después (`valoresCampana` en preventa.ts). La preventa de Navidad y los envíos
 * a provincia van en la franja de la campaña, bajo los kits (`Kits.tsx`).
 * La preventa va con las palabras del manual (Campaña 01: «preventa 10 % a las
 * primeras 20 clientas»). El S/ 99 es la regla de envío, no un precio.
 */
export const FRANJA = [
  "{preventa}Preventa: 10 % a las primeras 20 clientas",
  "Envío gratis en Ciudad Constitución",
  "Fuera de Constitución, envío gratis desde S/ 99",
];

export type Destino =
  | { categoria: string }
  | { buscar: string }
  | { ancla: "servicios" | "ofertas" | "mejorar" }
  | { whatsapp: string };

/**
 * El héroe de la portada: UNO solo y general (toda la tienda, no sólo la
 * campaña), 1 título y 1 botón; con la franja y el menú, ≤ 60 palabras en la
 * primera pantalla. «Cuidado de salón, cerca de casa» sale del manual («¿Por
 * qué nos eligen? … productos de salón cerca de casa»). Los envases de la
 * repisa y «Kits desde S/ X» salen de la base (`Portada.tsx`).
 */
export const HEROE = {
  titulo: "Cuidado de salón,",
  acento: "cerca de casa",
  texto: "Originales, con registro sanitario. Drucila te asesora gratis.",
  boton: "Comprar ahora",
} as const;

/**
 * Los círculos bajo el héroe: las 4 categorías del panel (con el envase que
 * mejor las dice) y la asesoría. «Ofertas» no va solo: hoy ningún precio está
 * rebajado (la lista saldría vacía) y los dúos de campaña viven en «Kits y ofertas».
 */
export const CIRCULOS = [
  { texto: "Rostro coreano", categoria: "Rostro", codigo: "MU010" },
  { texto: "Cabello", categoria: "Cabello", codigo: "MU001" },
  { texto: "Cuerpo", categoria: "Cuerpo", codigo: "MU017" },
  { texto: "Kits", categoria: "Kits y ofertas", codigo: "KT04" },
] as const;

/**
 * «Tu rutina coreana en 3 pasos» (la del Kit Rutina facial, KT02: limpiador +
 * niacinamida + FPS 50; la vitamina C, como otra opción del paso 2). «Para qué»
 * con las palabras de «¿Qué quieres mejorar?»: «ayuda a», nunca «cura».
 */
export const RUTINA_COREANA = {
  kit: "KT02",
  pasos: [
    { verbo: "Limpia", cuando: "Mañana y noche", productos: [{ codigo: "MU009", para: "Limpia sin resecar tu piel." }] },
    {
      verbo: "Trata",
      cuando: "El sérum que tu piel pide",
      productos: [
        { codigo: "MU011", para: "Ayuda con granitos y brillo." },
        { codigo: "MU010", para: "Ayuda a emparejar las manchas." },
      ],
    },
    { verbo: "Protege", cuando: "De día, siempre", productos: [{ codigo: "MU013", para: "Te cuida del sol de la selva." }] },
  ],
} as const;

/** Las 3 señales de confianza, con las palabras del manual («Musa en pocas palabras», «Envío», «Pagos»). */
export const CONFIANZA = [
  { icono: "original", titulo: "Originales, con registro sanitario", texto: "Cada producto con su NSO. Si llega dañado, vencido o equivocado, te lo cambiamos sin costo." },
  { icono: "asesoria", titulo: "Asesoría gratis con Drucila", texto: "Te pregunta por tu piel o tu cabello y te recomienda solo lo que te sirve. Sábados: diagnóstico gratis." },
  { icono: "entrega", titulo: "Entrega en Constitución", texto: "Envío gratis en Ciudad Constitución. Fuera, gratis desde S/ 99 (Villa Rica, Oxapampa, Puerto Bermúdez)." },
] as const;

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
export const DESPEDIDA = { script: "Gracias, linda", firma: "— Drucila, tu asesora de belleza" } as const;


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
