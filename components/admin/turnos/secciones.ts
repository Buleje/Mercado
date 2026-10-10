/**
 * Cómo se recorre Ventas y caja › Turnos: cuatro secciones en `?sub=` (la
 * barra compartida `BarraDeSecciones`, igual que Me deben). Brandon (10-10):
 * «organizar tipo en pestaña, hacer sección para pasar de una a otra».
 *
 * Hasta el 10-10 todo iba apilado (formulario, avisos, «Este mes» e historial)
 * y el historial tenía sus propias pestañas: «Línea de tiempo» repetía la Lista
 * con menos columnas y «Por cajero» era la misma tabla del ranking de Cajeros.
 * Esas dos se fueron; la Semana pasó a ser sección.
 */

export type SeccionTurnos = "turno" | "historial" | "semana" | "cajeros";

export const SECCIONES_TURNOS: readonly SeccionTurnos[] = ["turno", "historial", "semana", "cajeros"];

/** El `tabpanel` que cambia con la barra (cada pestaña lo controla). */
export const ID_PANEL_TURNOS = "turnos-secciones-panel";

export const SECCION: Record<SeccionTurnos, { rotulo: string; ayuda: { what: string; affects?: string; example?: string } }> = {
  turno: {
    rotulo: "Turno",
    ayuda: {
      what: "Quién atiende, con cuánto abrió el cajón y lo vendido en vivo. Abrir el turno abre la caja (o usa la que ya está abierta): no hace falta abrirla aparte.",
      affects: "Al cerrar el turno cuentas el efectivo y se cierra su caja con la diferencia. El cuadre queda en Caja › Historial.",
      example: "Abre con S/ 200, vende S/ 850 (S/ 500 en efectivo), cuenta S/ 700: caja cuadrada.",
    },
  },
  historial: {
    rotulo: "Historial",
    ayuda: {
      what: "Cada turno cerrado: quién atendió, de qué hora a qué hora, lo vendido y la diferencia de su caja. Toca uno para ver su resumen (medios de pago, lo más vendido y el corte).",
      affects: "El conteo de cada caja, con lo esperado y la tolerancia, está en Caja › Historial › Por caja.",
    },
  },
  semana: {
    rotulo: "Semana",
    ayuda: { what: "Los turnos de esta semana, de lunes a domingo, con el abierto incluido: quién cubrió cada día." },
  },
  cajeros: {
    rotulo: "Cajeros",
    ayuda: {
      what: "Cada cajero con sus turnos, lo vendido, las ventas por hora, el ticket promedio y la diferencia de caja de todo el historial.",
      affects: "El ranking va por ventas por hora trabajada, no por lo vendido en total: quien atiende las horas flojas no queda último por eso.",
    },
  },
};
