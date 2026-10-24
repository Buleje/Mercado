/**
 * Lo que el dueño cambia sin tocar componentes en la FICHA de un producto o
 * servicio (ADR-460): los pasos de «Cómo usarlo», cómo se reserva un servicio
 * y los beneficios al lado del botón. Lo de la portada y el catálogo está en
 * `anuncios.ts`. `{duracion}` = la del servicio; `{pagos}` = los medios de
 * pago prendidos en Ajustes. Sin dato, esa línea no se muestra.
 */

/**
 * «Cómo usarlo», en pasos, por categoría (el nombre igual que en el panel). Es
 * el consejo general de la categoría, no el del envase: si un producto necesita
 * otra cosa, se escribe en su descripción en el panel.
 */
export const MODO_DE_USO: Record<string, readonly string[]> = {
  Shampoo: [
    "Moja bien el cabello con agua tibia.",
    "Aplica una cantidad del tamaño de una moneda y masajea el cuero cabelludo con las yemas, sin frotar las puntas.",
    "Enjuaga y repite si lo sientes necesario. Sigue con el acondicionador de la misma línea.",
  ],
  Acondicionador: [
    "Después del shampoo, retira el exceso de agua con las manos.",
    "Aplica de medios a puntas, sin tocar la raíz, y desenreda con los dedos o un peine de dientes anchos.",
    "Deja actuar 2 a 3 minutos y enjuaga con agua fría para sellar el brillo.",
  ],
  Tratamientos: [
    "Úsalo una o dos veces por semana: mascarillas y ampollas sobre el cabello limpio y húmedo; aceites y sérums, también en seco.",
    "Distribuye de medios a puntas y deja actuar el tiempo que indica el envase.",
    "Enjuaga las mascarillas y ampollas; los aceites y sérums no se enjuagan.",
  ],
  Coloración: [
    "Haz la prueba de sensibilidad 48 horas antes, en la piel detrás de la oreja.",
    "Prepara la mezcla con guantes, en un recipiente que no sea de metal, con la proporción del envase.",
    "Aplica sobre el cabello seco, respeta el tiempo de exposición y enjuaga hasta que el agua salga clara.",
  ],
  Styling: [
    "Aplica sobre el cabello húmedo o seco, según el peinado que buscas.",
    "Usa poca cantidad, de medios a puntas, y define con los dedos o el cepillo.",
    "Si vas a usar plancha o secadora, aplica antes el protector térmico.",
  ],
  Herramientas: [
    "Aplica protector térmico. La plancha y el rizador, siempre con el cabello completamente seco.",
    "Elige la temperatura según tu cabello: más baja si es fino, con color o decolorado.",
    "Trabaja por secciones finas y desconecta el equipo al terminar.",
  ],
  Kits: [
    "Empieza con el shampoo y masajea el cuero cabelludo.",
    "Sigue con el acondicionador o la mascarilla, de medios a puntas.",
    "Termina con el tratamiento sin enjuague para sellar el resultado.",
  ],
};

/** Ficha de un servicio: cómo se reserva (los servicios no van a la bolsa). */
export const PASOS_RESERVA = [
  "Escríbenos por WhatsApp con el servicio que quieres: el mensaje ya va armado.",
  "Te confirmamos el día y la hora con una de nuestras estilistas.",
  "Vienes al salón y pagas allí, al terminar.",
] as const;

/** Los beneficios al lado del botón de reservar (los de comprar son `BENEFICIOS`). */
export const BENEFICIOS_SERVICIO = [
  { icono: "reloj", titulo: "Dura {duracion}", texto: "Aproximado: depende del largo y del estado de tu cabello." },
  { icono: "pago", titulo: "Se paga en el salón", texto: "Al terminar el servicio, no por adelantado." },
  { icono: "chat", titulo: "Confirmamos por WhatsApp", texto: "Te escribimos para acordar el día y la hora." },
] as const;
