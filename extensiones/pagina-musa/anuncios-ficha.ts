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
  Cabello: [
    "Usa el shampoo sin sal con agua tibia y masajea el cuero cabelludo con las yemas, sin frotar las puntas.",
    "Sigue con el acondicionador o la mascarilla de medios a puntas; déjala actuar el tiempo del envase y enjuaga con agua fría.",
    "Termina con unas gotas de aceite de argán en las puntas. Si usas plancha o secador, antes el protector térmico.",
  ],
  Rostro: [
    "Mañana y noche, limpia el rostro con el gel de pH bajo y sécalo con toques suaves.",
    "Aplica el sérum (vitamina C de día, niacinamida o hialurónico según tu piel) y deja que se absorba.",
    "De día, termina SIEMPRE con protector FPS 50 y renuévalo cada 2-3 horas si estás al sol.",
  ],
  Cuerpo: [
    "Después del baño, con la piel todavía húmeda, aplica la crema o el aceite con masajes suaves.",
    "Usa el exfoliante una o dos veces por semana, nunca sobre piel irritada.",
    "Si vas a estar al sol, aplica el protector FPS 50 20 minutos antes y renuévalo al salir del agua.",
  ],
  "Kits y ofertas": [
    "Cada kit trae la rutina completa: sigue el orden de la descripción (limpiar, tratar, proteger).",
    "Si es para regalo, avísale a Drucila por WhatsApp y te lo prepara en caja.",
    "¿Dudas con el orden o la frecuencia? Escríbele: la asesoría es gratis.",
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
