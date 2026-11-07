/**
 * lib/planificacion/plantillas-politicas.ts — las políticas, el protocolo de
 * atención y las preguntas frecuentes «típicas» por rubro (ADR-497).
 *
 * Son un punto de partida para editar, no un reglamento: textos cortos, en
 * tuteo, con «[completa]» donde va un dato del negocio. No citan números de
 * norma (el libro de reclamaciones sólo dice «dentro del plazo de ley»).
 * Puro: lo usa la vista de Políticas y lo puede leer un test.
 */
import type { CATEGORIAS_POLITICA } from "@/lib/planificacion/secciones";

export const RUBROS_PLANTILLA = ["general", "restaurante", "forestal", "belleza"] as const;
export type RubroPlantilla = (typeof RUBROS_PLANTILLA)[number];

export const NOMBRE_RUBRO: Readonly<Record<RubroPlantilla, string>> = {
  general: "Bodega o tienda",
  restaurante: "Restaurante",
  forestal: "Forestal o aserradero",
  belleza: "Belleza",
};

export interface PlantillaPolitica {
  categoria: (typeof CATEGORIAS_POLITICA)[number];
  titulo: string;
  texto: string;
}
export interface PlantillaPaso {
  paso: string;
  detalle: string;
}
export interface PlantillaPregunta {
  pregunta: string;
  respuesta: string;
}

/** El rubro que más se parece a lo escrito en la ficha («bodega y minimarket», «aserradero»). */
export function rubroDeTexto(texto: string): RubroPlantilla {
  const t = texto.toLowerCase();
  if (/forest|madera|aserr|troza|tablar|maderer/.test(t)) return "forestal";
  if (/restaur|comida|cevich|poller|caf[eé]|men[uú]|cocina|chifa|juguer/.test(t)) return "restaurante";
  if (/belleza|cosm[eé]t|maquill|spa\b|peluq|est[eé]tic|u[ñn]as|barber|sal[oó]n/.test(t)) return "belleza";
  return "general";
}

// ── Políticas ────────────────────────────────────────────────────────────────

type ClavePolitica =
  | "atencion"
  | "reclamaciones"
  | "cambios"
  | "precios"
  | "fiado"
  | "pagos"
  | "delivery"
  | "horario"
  | "personal"
  | "higiene";

const BASE: Readonly<Record<ClavePolitica, PlantillaPolitica>> = {
  atencion: {
    categoria: "Atención al cliente",
    titulo: "Atención al cliente",
    texto:
      "Saluda a cada cliente apenas entra y atiéndelo en orden de llegada. Si no tienes lo que busca, ofrécele algo parecido o dile cuándo llega. Nunca discutas con un cliente: si hay un problema, llama a [completa].",
  },
  reclamaciones: {
    categoria: "Atención al cliente",
    titulo: "Libro de reclamaciones",
    texto:
      "El Libro de Reclamaciones (físico o virtual) está a la vista. Si un cliente lo pide, se lo das sin preguntar el motivo y le entregas su copia. El negocio responde por escrito dentro del plazo de ley. Quién responde: [completa].",
  },
  cambios: {
    categoria: "Cambios y devoluciones",
    titulo: "Cambios y devoluciones",
    texto:
      "Cambiamos un producto con falla o vencido dentro de [completa] días, con su boleta o ticket. Lo abierto o usado en buen estado no se cambia, salvo falla. El dinero se devuelve por el mismo medio con el que pagó.",
  },
  precios: {
    categoria: "Precios y descuentos",
    titulo: "Precios y descuentos",
    texto:
      "Todo producto a la venta tiene su precio a la vista. Los descuentos sólo los autoriza [completa]. Por mayor: desde [completa] unidades rige la lista de precios por mayor.",
  },
  fiado: {
    categoria: "Crédito y fiado",
    titulo: "Fiado a clientes",
    texto:
      "Sólo se fía a clientes conocidos que autorizó [completa], hasta S/ [completa] por persona. Cada fiado se anota en el sistema en el momento, con nombre y teléfono. Se cobra cada [completa]; con deuda vencida no se fía más.",
  },
  pagos: {
    categoria: "Pagos",
    titulo: "Formas de pago",
    texto:
      "Aceptamos efectivo, Yape, Plin y tarjeta. Con Yape o Plin, confirma que el pago llegó al celular del negocio antes de entregar. Con tarjeta, el mínimo es S/ [completa]. Siempre se entrega comprobante.",
  },
  delivery: {
    categoria: "Delivery",
    titulo: "Delivery",
    texto:
      "Llevamos pedidos a [completa], de [completa] a [completa]. Pedido mínimo S/ [completa]; envío S/ [completa]. Tiempo aproximado: [completa] minutos. El repartidor confirma el pago antes de salir.",
  },
  horario: {
    categoria: "Horario",
    titulo: "Horario de atención",
    texto:
      "Atendemos de lunes a sábado de [completa] a [completa] y domingos de [completa] a [completa]. Feriados: [completa]. El horario está en la puerta y en las redes.",
  },
  personal: {
    categoria: "Personal",
    titulo: "Personal",
    texto:
      "Se llega 10 minutos antes del turno, con el uniforme limpio. El celular personal, sólo en el descanso. La caja se cuenta al recibir y al entregar el turno, delante del encargado.",
  },
  higiene: {
    categoria: "Seguridad e higiene",
    titulo: "Higiene y limpieza",
    texto:
      "El local se limpia al abrir y al cerrar. Las fechas de vencimiento se revisan cada [completa] y lo vencido se retira de la venta. Manos limpias para despachar alimentos a granel.",
  },
};

/** Lo que cambia o se suma en cada rubro (`null` = no aplica). */
const POR_RUBRO: Readonly<Record<RubroPlantilla, { cambia: Partial<Record<ClavePolitica, PlantillaPolitica | null>>; suma: PlantillaPolitica[] }>> = {
  general: { cambia: {}, suma: [] },
  restaurante: {
    cambia: {
      cambios: {
        categoria: "Cambios y devoluciones",
        titulo: "Reclamos por un plato",
        texto:
          "Si un plato llega frío, equivocado o con un problema, se cambia sin costo apenas el cliente lo dice, y el mozo avisa al encargado. No se cobra lo que el cliente no pudo comer por un error nuestro.",
      },
      delivery: {
        categoria: "Delivery",
        titulo: "Para llevar y delivery",
        texto:
          "Pedidos por WhatsApp al [completa]. Pedido mínimo S/ [completa]; delivery a [completa]. El táper se cobra aparte: S/ [completa]. Tiempo aproximado: [completa] minutos.",
      },
      higiene: {
        categoria: "Seguridad e higiene",
        titulo: "Manipulación de alimentos",
        texto:
          "En cocina, gorro, mandil y manos lavadas. Los insumos se guardan tapados y rotulados con fecha: lo que entra primero sale primero. Lo crudo, separado de lo cocido. Limpieza profunda de la cocina cada [completa].",
      },
    },
    suma: [
      {
        categoria: "Atención al cliente",
        titulo: "Reservas",
        texto: "Reservamos mesas con nombre y teléfono, con [completa] horas de anticipación. Pasados 15 minutos de la hora, la mesa se libera.",
      },
    ],
  },
  forestal: {
    cambia: {
      atencion: {
        categoria: "Atención al cliente",
        titulo: "Atención a compradores",
        texto:
          "Cada comprador recibe su cotización por escrito: especie, medidas, volumen en pies tablares y precio. El pedido se confirma con [completa] % de adelanto.",
      },
      cambios: {
        categoria: "Cambios y devoluciones",
        titulo: "Reclamos por medida o calidad",
        texto:
          "La madera se revisa y se cubica con el comprador al cargar. Un reclamo por medida o calidad se recibe hasta [completa] días después del despacho, con fotos y la guía. La madera ya trabajada no tiene reclamo.",
      },
      precios: {
        categoria: "Precios y descuentos",
        titulo: "Precios por especie",
        texto:
          "Los precios van por pie tablar y por especie, según la lista vigente del [completa]. Descuento por volumen desde [completa] pies tablares, sólo con autorización de [completa].",
      },
      fiado: {
        categoria: "Crédito y fiado",
        titulo: "Crédito a compradores",
        texto:
          "Sólo a compradores con historial y acuerdo firmado, hasta S/ [completa] y [completa] días. Si no paga al vencer, no se despacha más.",
      },
      pagos: {
        categoria: "Pagos",
        titulo: "Pagos",
        texto:
          "Transferencia o depósito a la cuenta del negocio, Yape para montos chicos y efectivo con recibo. La madera sale con el pago confirmado o el crédito aprobado.",
      },
      delivery: {
        categoria: "Delivery",
        titulo: "Despacho y flete",
        texto:
          "Toda carga sale con su guía de transporte forestal y su lista de trozas o piezas. El flete lo paga [completa]. Se despacha de [completa] a [completa].",
      },
      horario: {
        categoria: "Horario",
        titulo: "Horario de patio y oficina",
        texto:
          "Patio de [completa] a [completa]; oficina de [completa] a [completa]. Las cargas fuera de horario se coordinan con un día de anticipación.",
      },
      higiene: {
        categoria: "Seguridad e higiene",
        titulo: "Seguridad en el aserradero",
        texto:
          "En planta, siempre con casco, lentes, protector de oído, guantes y botas. Nadie opera una sierra sin capacitación. El aserrín se limpia al cerrar. Botiquín y extintor a la vista, revisados cada [completa].",
      },
    },
    suma: [
      {
        categoria: "Proveedores",
        titulo: "Madera legal",
        texto:
          "Sólo compramos madera con su guía de transporte forestal y los papeles en regla. Cada ingreso se anota en el libro de operaciones el mismo día.",
      },
    ],
  },
  belleza: {
    cambia: {
      atencion: {
        categoria: "Atención al cliente",
        titulo: "Citas y tolerancia",
        texto:
          "Atendemos con cita por WhatsApp al [completa]. Tolerancia de 15 minutos; después, la cita se reprograma. Si no puedes venir, avísanos con [completa] horas de anticipación.",
      },
      cambios: {
        categoria: "Cambios y devoluciones",
        titulo: "Cambios de productos",
        texto:
          "Lo sellado se cambia dentro de [completa] días con su comprobante. Lo abierto o probado no se cambia, por higiene, salvo falla de fábrica.",
      },
      delivery: {
        categoria: "Delivery",
        titulo: "Envíos de productos",
        texto: "Enviamos productos a [completa]; pedido mínimo S/ [completa]. Se paga por adelantado con Yape o transferencia.",
      },
      higiene: {
        categoria: "Seguridad e higiene",
        titulo: "Higiene y esterilización",
        texto:
          "Herramientas desinfectadas después de cada cliente; limas y palitos, de un solo uso. Toalla limpia para cada persona. Productos con su fecha de vencimiento a la vista.",
      },
    },
    suma: [
      {
        categoria: "Atención al cliente",
        titulo: "Retoques",
        texto: "Si un servicio no quedó bien, el retoque es gratis dentro de [completa] días.",
      },
    ],
  },
};

export function politicasTipicas(rubro: RubroPlantilla): PlantillaPolitica[] {
  const { cambia, suma } = POR_RUBRO[rubro];
  const base = (Object.keys(BASE) as ClavePolitica[])
    .map((k) => (k in cambia ? cambia[k] : BASE[k]))
    .filter((p): p is PlantillaPolitica => p != null);
  return [...base, ...suma];
}

// ── Protocolo de atención ────────────────────────────────────────────────────

const PROTOCOLO: Readonly<Record<RubroPlantilla, PlantillaPaso[]>> = {
  general: [
    { paso: "Saluda", detalle: "Mira al cliente, sonríe y saluda: «Buenos días, bienvenido. ¿En qué te ayudo?»" },
    { paso: "Escucha", detalle: "Deja que diga todo lo que busca sin interrumpir. Si no entiendes, pregunta: «¿Para qué lo vas a usar?»" },
    { paso: "Ofrece", detalle: "Muestra lo que pidió y una opción más (otra marca, otro tamaño, lo que combina). Si no hay, dile cuándo llega." },
    { paso: "Cobra y da comprobante", detalle: "Di el total en voz alta, pregunta cómo paga y entrega siempre su boleta o ticket. Con Yape, confirma que llegó." },
    { paso: "Despide", detalle: "Agradece y despide por su nombre si lo sabes: «Gracias, [nombre], te esperamos.»" },
  ],
  restaurante: [
    { paso: "Saluda y ubica", detalle: "Saluda en la puerta, pregunta cuántos son y llévalos a su mesa con la carta." },
    { paso: "Escucha y recomienda", detalle: "Cuenta el menú del día y el plato de la casa. Pregunta si alguien no come algo." },
    { paso: "Toma el pedido", detalle: "Anótalo, repítelo en voz alta y avisa el tiempo de espera." },
    { paso: "Cobra y da comprobante", detalle: "Lleva la cuenta a la mesa, pregunta cómo paga y entrega su boleta o factura." },
    { paso: "Despide", detalle: "Agradece, pregunta qué tal estuvo y despide: «Te esperamos pronto.»" },
  ],
  forestal: [
    { paso: "Saluda", detalle: "Saluda y pregunta qué obra o pedido tiene en mente." },
    { paso: "Escucha", detalle: "Anota especie, medidas, volumen en pies tablares y para cuándo lo necesita." },
    { paso: "Ofrece y cotiza", detalle: "Muestra la madera disponible y manda la cotización por escrito, con precio y plazo." },
    { paso: "Cobra y da comprobante", detalle: "Confirma el adelanto, la fecha de despacho y entrega su factura o boleta." },
    { paso: "Despacha y despide", detalle: "La carga sale con su guía y su lista; agradece y confirma que le llegó." },
  ],
  belleza: [
    { paso: "Saluda", detalle: "Saluda por su nombre y confirma la cita y el servicio." },
    { paso: "Escucha", detalle: "Pregunta qué quiere lograr y muestra fotos u opciones." },
    { paso: "Ofrece", detalle: "Di el precio y cuánto dura antes de empezar; sugiere un cuidado o producto que combine." },
    { paso: "Cobra y da comprobante", detalle: "Pregunta cómo paga y entrega su comprobante." },
    { paso: "Despide", detalle: "Recomienda los cuidados en casa y deja agendada la próxima cita." },
  ],
};

export function protocoloTipico(rubro: RubroPlantilla): PlantillaPaso[] {
  return PROTOCOLO[rubro];
}

// ── Preguntas frecuentes ─────────────────────────────────────────────────────

const COMUNES: Readonly<Record<"pago" | "horario" | "comprobante" | "ubicacion" | "whatsapp", PlantillaPregunta>> = {
  pago: { pregunta: "¿Aceptan Yape o tarjeta?", respuesta: "Sí: efectivo, Yape, Plin y tarjeta (mínimo S/ [completa] con tarjeta)." },
  horario: { pregunta: "¿Cuál es su horario?", respuesta: "De lunes a sábado de [completa] a [completa]; domingos de [completa] a [completa]." },
  comprobante: { pregunta: "¿Dan boleta o factura?", respuesta: "Sí, siempre. Para factura, danos tu RUC al momento de pagar." },
  ubicacion: { pregunta: "¿Dónde están?", respuesta: "En [completa], a una cuadra de [completa]." },
  whatsapp: { pregunta: "¿Puedo pedir por WhatsApp?", respuesta: "Sí, escríbenos al [completa] con tu pedido y tu dirección." },
};

const PREGUNTAS: Readonly<Record<RubroPlantilla, PlantillaPregunta[]>> = {
  general: [
    { pregunta: "¿Hacen delivery?", respuesta: "Sí, a [completa]. Pedido mínimo S/ [completa] y el envío cuesta S/ [completa]." },
    COMUNES.pago,
    COMUNES.horario,
    COMUNES.comprobante,
    { pregunta: "¿Puedo cambiar un producto?", respuesta: "Sí, si tiene falla o está vencido, dentro de [completa] días y con tu comprobante." },
    { pregunta: "¿Venden por mayor?", respuesta: "Sí, desde [completa] unidades hay precio por mayor." },
    COMUNES.ubicacion,
    COMUNES.whatsapp,
  ],
  restaurante: [
    { pregunta: "¿Tienen menú del día?", respuesta: "Sí, de [completa] a [completa], a S/ [completa]: entrada, segundo y refresco." },
    { pregunta: "¿Hacen reservas?", respuesta: "Sí, con nombre y teléfono, con [completa] horas de anticipación." },
    { pregunta: "¿Tienen opciones sin carne?", respuesta: "Sí: [completa]." },
    { pregunta: "¿Hacen delivery?", respuesta: "Sí, a [completa]. El táper se cobra aparte: S/ [completa]." },
    COMUNES.pago,
    COMUNES.horario,
    COMUNES.comprobante,
    COMUNES.ubicacion,
  ],
  forestal: [
    { pregunta: "¿Qué especies tienen?", respuesta: "Trabajamos [completa]. Pregunta por la disponibilidad de la semana." },
    { pregunta: "¿Venden por pie tablar o por troza?", respuesta: "Madera aserrada por pie tablar y trozas por metro cúbico." },
    { pregunta: "¿Cortan a medida?", respuesta: "Sí, desde [completa] pies tablares; el corte a medida se cotiza aparte." },
    { pregunta: "¿La madera es legal?", respuesta: "Sí: toda la madera sale con su guía de transporte forestal y su lista." },
    { pregunta: "¿Envían a otras ciudades?", respuesta: "Sí, coordinamos el flete a [completa]; lo paga [completa]." },
    { pregunta: "¿Cuánto demora un pedido?", respuesta: "Entre [completa] y [completa] días desde el adelanto." },
    COMUNES.pago,
    COMUNES.comprobante,
  ],
  belleza: [
    { pregunta: "¿Necesito cita?", respuesta: "Sí, por WhatsApp al [completa]. Si hay espacio, también atendemos sin cita." },
    { pregunta: "¿Cuánto dura el servicio?", respuesta: "Depende: [completa]. Te lo decimos al reservar." },
    { pregunta: "¿Qué marcas usan?", respuesta: "Trabajamos con [completa]." },
    { pregunta: "¿Atienden a domicilio?", respuesta: "Sí, en [completa], con un recargo de S/ [completa]." },
    { pregunta: "¿Puedo cambiar un producto?", respuesta: "Sí, si está sellado, dentro de [completa] días y con tu comprobante." },
    COMUNES.pago,
    COMUNES.horario,
    COMUNES.ubicacion,
  ],
};

export function preguntasTipicas(rubro: RubroPlantilla): PlantillaPregunta[] {
  return PREGUNTAS[rubro];
}

/** Para comparar títulos sin que una mayúscula o un espacio los haga distintos. */
export function normalizarTitulo(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}
