/**
 * loth-extraccion-ayuda — lo que dice el ⓘ de cada aviso de «Extracción»
 * (ADR-454): qué es y qué afecta. El caso concreto lo pone el texto del
 * servidor, que va arriba en el mismo ⓘ. Texto, sin lógica.
 */

import type { TipoAvisoExtraccion } from "@/lib/forestal/loth-extraccion-tipos";

/** Lo que dice el ⓘ de cada aviso, además de su texto: qué es y qué afecta. */
export const AYUDA_AVISO: Record<TipoAvisoExtraccion, { what: string; affects: string }> = {
  avance_80: {
    what: "Lo talado ya pasó el 80 % del tope de la especie.",
    affects: "Quedan pocos árboles por talar antes del límite.",
  },
  avance_100: {
    what: "Lo talado llegó al tope de la especie.",
    affects: "Otra tala de esa especie ya pasa el límite.",
  },
  exceso_autorizado: {
    what: "Lo talado pasa lo autorizado para la especie.",
    affects: "Es lo primero que mira una fiscalización.",
  },
  medido_sobre_censo: {
    what: "La tala midió más de lo que estimó el censo.",
    affects: "El saldo contra el censo queda negativo; no es una falta.",
  },
  talados_sin_trozar: {
    what: "Árboles talados que todavía no tienen trozas.",
    affects: "Esa madera no se puede despachar hasta trozarla.",
  },
  salida_sin_trozado: {
    what: "Una troza salió o se consumió sin su línea de trozado.",
    affects: "La cadena se corta: no se sabe de qué árbol vino.",
  },
  recibida_sin_despacho: {
    what: "La planta recibió una troza que el libro no despachó.",
    affects: "La guía del CTP no encuentra su salida del bosque.",
  },
  censo_libro_distinto: {
    what: "El censo y el libro no dicen lo mismo de un árbol.",
    affects: "El mapa y los saldos pueden contar distinto.",
  },
  semilleros_sistema_vs_regente: {
    what: "El sistema aparta semilleros que el regente no marcó.",
    affects: "Esos m³ salen de lo aprobado según censo.",
  },
  especie_fuera_del_plan: {
    what: "Hay operaciones de una especie que el plan no autoriza.",
    affects: "Esa madera no tiene respaldo en el plan de manejo.",
  },
  autorizado_sin_respaldo: {
    what: "Lo autorizado es mayor que lo que el censo puede dar.",
    affects: "El tope real lo pone el censo, no lo autorizado.",
  },
  lineas_sin_plan: {
    what: "Líneas del libro que no caen en ningún plan.",
    affects: "No descuentan de ningún saldo hasta atarlas a su árbol.",
  },
  plan_sin_permiso: {
    what: "El plan no está unido a su permiso.",
    affects: "No se puede seguir la madera hasta la planta por el permiso.",
  },
  permiso_sin_plan: {
    what: "El permiso no tiene plan de manejo cargado.",
    affects: "Sin censo no hay saldo que calcular.",
  },
  libro_truncado: {
    what: "El libro es más grande que lo que se lee de una vez.",
    affects: "Las cifras pueden quedarse cortas.",
  },
  agota_pronto: {
    what: "Al ritmo de tala de las últimas semanas, el saldo por talar se acaba en menos de 60 días.",
    affects: "Conviene planear el cierre o pedir ampliación antes de quedarse sin saldo.",
  },
};

/**
 * El ⓘ de las dos columnas que NO se cortan en «hasta» (la respuesta trae
 * `recibidoAlDia: true`): muestran lo que el Libro CTP tiene hoy.
 */
export const AYUDA_RECIBIDO_AL_DIA = {
  recibido: "Lo que la planta tiene recibido hoy, aunque elijas un período anterior: la recepción se fecha en el Libro CTP.",
  aserrado: "Lo que ya entró a una corrida del CTP hoy, aunque elijas un período anterior.",
} as const;
