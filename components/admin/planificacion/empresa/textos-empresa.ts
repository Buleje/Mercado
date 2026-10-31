/**
 * Lo que dicen los ⓘ de Planificación › Empresa (ADR-497): qué es cada tipo de
 * sociedad y cada régimen, ejemplos de misión o visión y la pregunta guía de
 * cada bloque del lienzo. Sin cifras de norma: cambian cada año (la UIT) y el
 * plan no las confirma; cada ⓘ remite al contador o a la entidad.
 */
import type { BloqueLienzo, REGIMENES_TRIBUTARIOS, TIPOS_SOCIEDAD } from "@/lib/planificacion/secciones";

export const AYUDA_SOCIEDAD: Record<(typeof TIPOS_SOCIEDAD)[number], string> = {
  "Persona natural con negocio": "Tú eres el negocio: sacas RUC a tu nombre y respondes con tus bienes.",
  EIRL: "Empresa de un solo dueño; responde la empresa, no tus bienes personales.",
  SAC: "De 2 a 20 accionistas; la forma más usada por empresas familiares y pymes.",
  SACS: "SAC simplificada: se crea en línea y sin notario; mismas reglas de 2 a 20 accionistas.",
  SRL: "De 2 a 20 socios con participaciones; entrar o salir pide cambiar la escritura.",
  SA: "Para empresas grandes o con muchos accionistas; directorio obligatorio.",
  Asociación: "Sin fines de lucro: lo que gana se queda en la asociación.",
  Cooperativa: "Los socios trabajan, compran o venden juntos y se reparten según lo que usan.",
  Otra: "Cualquier otra forma; escríbela en la descripción.",
};

export const AYUDA_REGIMEN: Record<(typeof REGIMENES_TRIBUTARIOS)[number], string> = {
  NRUS: "Nuevo RUS: para personas naturales que venden poco al público; pagas una cuota fija al mes y sólo das boletas.",
  RER: "Régimen Especial: pagas un porcentaje chico de lo que vendes cada mes y das facturas; tiene tope de ventas y de giros.",
  "MYPE Tributario": "Para micro y pequeñas empresas: pagos a cuenta bajos y el impuesto anual sobre tu ganancia.",
  "Régimen General": "Sin tope de ventas: impuesto anual sobre la ganancia y libros contables completos.",
  "No sé todavía": "Lo eliges al sacar el RUC; tu contador te dice cuál conviene según lo que vas a vender.",
};

export const AYUDA_IDENTIDAD = {
  mision: {
    que: "Para qué existe tu negocio hoy: qué haces, para quién y cómo.",
    ejemplo: "Llevar a las familias de Constitución productos frescos y de confianza, con buen trato y entrega rápida.",
  },
  vision: {
    que: "Dónde quieres estar en unos años; una meta grande que oriente las decisiones.",
    ejemplo: "Ser en 2030 la bodega de referencia de Pasco, con tienda en línea y tres locales.",
  },
  valores: {
    que: "Lo que no se negocia en tu forma de trabajar; cada uno con una línea de qué significa en la práctica.",
    ejemplo: "Honestidad: el vuelto exacto y el precio a la vista, siempre.",
  },
  propuestaValor: {
    que: "Por qué te eligen a ti y no a otro: lo que el cliente gana contigo.",
    ejemplo: "Todo lo del día en un solo lugar, fiado para vecinos de confianza y delivery en 30 minutos.",
  },
  clienteIdeal: {
    que: "A quién le vendes de verdad: quién es, qué necesita y cuándo compra.",
    ejemplo: "Mamás del barrio de 25 a 45 años que compran todos los días y pagan con Yape.",
  },
  diferenciadores: {
    que: "Lo que tienes y la competencia no: horario, precio, trato, variedad, rapidez.",
    ejemplo: "Abrimos hasta las 11 de la noche y aceptamos todos los medios de pago.",
  },
  lema: { que: "Una frase corta que se recuerde (va en tus bolsas, letrero o redes).", ejemplo: "Lo de tu casa, a la vuelta." },
} as const;

/** El lienzo del modelo de negocio: rótulo y la pregunta que responde cada bloque. */
export const BLOQUE_LIENZO: Record<BloqueLienzo, { rotulo: string; pregunta: string; ejemplo: string }> = {
  sociosClave: {
    rotulo: "Socios clave",
    pregunta: "¿Quiénes te ayudan a funcionar y no son tus clientes?",
    ejemplo: "Distribuidora de abarrotes, panadería del barrio, banco que da el préstamo.",
  },
  actividadesClave: {
    rotulo: "Actividades clave",
    pregunta: "¿Qué tienes que hacer bien todos los días para cumplir tu propuesta?",
    ejemplo: "Comprar barato, reponer a tiempo, atender rápido.",
  },
  recursosClave: {
    rotulo: "Recursos clave",
    pregunta: "¿Qué necesitas tener para funcionar?",
    ejemplo: "El local, la refrigeradora, el capital de trabajo, la caja registradora.",
  },
  propuestaValor: {
    rotulo: "Propuesta de valor",
    pregunta: "¿Qué problema le resuelves al cliente y por qué te elige?",
    ejemplo: "Todo cerca, fresco y con fiado para vecinos.",
  },
  relacionClientes: {
    rotulo: "Relación con clientes",
    pregunta: "¿Cómo tratas y retienes a tus clientes?",
    ejemplo: "Trato por nombre, puntos por compra, WhatsApp para pedidos.",
  },
  canales: {
    rotulo: "Canales",
    pregunta: "¿Por dónde te conocen, te compran y reciben lo que compran?",
    ejemplo: "Tienda física, delivery en moto, Facebook, tienda en línea.",
  },
  segmentos: {
    rotulo: "Segmentos de clientes",
    pregunta: "¿Para quiénes creas valor? ¿Quiénes son tus clientes más importantes?",
    ejemplo: "Familias del barrio, pequeños restaurantes, obreros de paso.",
  },
  costos: {
    rotulo: "Estructura de costos",
    pregunta: "¿Cuáles son los gastos más importantes del negocio?",
    ejemplo: "Mercadería, alquiler, sueldos, luz, transporte.",
  },
  ingresos: {
    rotulo: "Fuentes de ingresos",
    pregunta: "¿Por qué te pagan y cómo te pagan?",
    ejemplo: "Venta al por menor, pedidos por delivery, recargas; efectivo y Yape.",
  },
};
