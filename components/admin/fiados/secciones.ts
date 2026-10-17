/**
 * Cómo se recorre Ventas y caja › Me deben: cuatro secciones en una fila, cada
 * una un valor de `?sub=` (`FIADO_VISTAS`). La última que usaste se recuerda
 * por negocio (`useSubvistaModulo`).
 *
 * Hasta el 10-10 eran cuatro pestañas que se repetían: la lista de quién debe
 * salía en Resumen, en Cobranza y en Análisis («Top deudores»); el total por
 * cobrar, en tres franjas de cifras; la antigüedad de la deuda, con tramos
 * distintos en Análisis (0-7/8-30/31-60/+60) y en Cobranza (al día/1-30/31-60/
 * 61-90/+90). Ahora cada sección contesta UNA pregunta y las cifras van en
 * «Indicadores».
 */
import type { FiadoTab } from "./tipos";

interface Seccion {
  clave: FiadoTab;
  rotulo: string;
  /** Lo que explica la ⓘ del título cuando esta sección está a la vista. */
  ayuda: { what: string; affects?: string; example?: string };
}

export const SECCIONES_ME_DEBEN: readonly Seccion[] = [
  {
    clave: "cobranza",
    rotulo: "Quién debe",
    ayuda: {
      what: "Cada cliente con lo que te debe sumando todos sus fiados abiertos, primero los más atrasados. Los tramos dicen cuánto hace que debió pagar.",
      affects: "«Cobrar» reparte el pago del fiado más viejo al más nuevo y, con la caja abierta, entra a la caja. «Escribir» usa tus mensajes por tramo y lo anota en la bitácora.",
      example: "Rosa · S/ 85.00 · debió pagar hace 29 días · usó 85 % de su límite de S/ 100.",
    },
  },
  {
    clave: "agenda",
    rotulo: "Por vencer",
    ayuda: {
      what: "Lo que toca cobrar por fecha: las promesas de pago que no se cumplieron y los fiados que vencen hoy, esta semana o después.",
      affects: "Un fiado sin fecha de vencimiento no aparece acá: en «Cada fiado», columna Vencimiento, toca «Poner fecha».",
      example: "Juan prometió pagar el jueves 08/10 y no pagó: sale arriba, en rojo, para llamarlo hoy.",
    },
  },
  {
    clave: "cobrado",
    rotulo: "Cobrado",
    ayuda: {
      what: "Quién te pagó, cuánto y con qué medio, del más reciente al más viejo, y cómo va la cobranza mes a mes.",
      example: "sábado 10/10 · Rosa · S/ 20.00 · Yape.",
    },
  },
  {
    clave: "deudores",
    rotulo: "Cada fiado",
    ayuda: {
      what: "Todos los fiados uno por uno, también los pagados y cancelados: ordénalos, búscalos y marca varios para cobrarlos juntos.",
    },
  },
];

export function seccionMeDeben(v: FiadoTab): Seccion {
  return SECCIONES_ME_DEBEN.find((s) => s.clave === v) ?? SECCIONES_ME_DEBEN[0];
}

export const ID_PANEL_ME_DEBEN = "me-deben-secciones-panel";
