/**
 * Cómo se recorre Ventas y caja › Caja: dos pestañas («Hoy» e «Historial») y,
 * adentro de cada una, sus secciones. Cada sección es un valor de `?sub=`
 * (`SUBS_CAJA`), así un enlace abre exactamente esa y los nombres de antes
 * (`historial`, `auditoria`, `reconciliacion`, `cuadrar`) siguen llevando a su
 * lugar sin alias.
 *
 * Hasta el 10-10 eran cinco pestañas sueltas y «Hoy» apilaba todo en una
 * columna (1,7 pantallas a 1280 px y 4 a 400 px con la caja abierta). Brandon:
 * «organizar tipo en pestaña, hacer sección para pasar de una a otra».
 */
import type { VistaCaja } from "./tipos";

export type GrupoCaja = "hoy" | "historial";

interface Seccion {
  clave: VistaCaja;
  rotulo: string;
  /** Lo que explica la ⓘ del título cuando esta sección está a la vista. */
  ayuda: { what: string; affects?: string; example?: string };
}

export const SECCIONES: Record<GrupoCaja, { rotulo: string; titulo: string; secciones: Seccion[] }> = {
  hoy: {
    rotulo: "Hoy",
    titulo: "Caja de hoy",
    secciones: [
      {
        clave: "hoy",
        rotulo: "Resumen",
        ayuda: {
          what: "El efectivo físico del día: abres con un monto inicial, registras ingresos y retiros y al cerrar comparas lo contado con lo esperado. El Resumen dice si cuadra con las ventas y de dónde vino el efectivo.",
          example: "Valentina abre con S/ 200, vende durante el turno y al cerrar el sistema le dice si hay faltante o sobrante.",
        },
      },
      {
        clave: "movimientos",
        rotulo: "Movimientos",
        ayuda: {
          what: "Todo lo que entró y salió de la caja desde que la abriste, en lista o en línea de tiempo, con su origen.",
          example: "«Retiro del dueño» = lo que sacaste para tu casa; «Adelanto» = plata adelantada a un trabajador.",
        },
      },
      {
        clave: "medios",
        rotulo: "Medios de pago",
        ayuda: {
          what: "Las ventas de esta caja por medio de pago, el cruce de Yape y Plin con tu app y las ventas por hora.",
          affects: "Yape, Plin, tarjeta y transferencia no entran al cajón: no suman al esperado.",
        },
      },
      {
        clave: "cuadrar",
        rotulo: "Cuadrar",
        ayuda: {
          what: "Cuentas billetes y monedas y lo comparas con lo que debería haber. Queda guardado en la caja; no la cierra.",
          example: "Se esperan S/ 550 y cuentas S/ 540: faltante de S/ 10, con una observación de por qué.",
        },
      },
    ],
  },
  historial: {
    rotulo: "Historial",
    titulo: "Historial de la caja",
    secciones: [
      {
        clave: "historial",
        rotulo: "Por caja",
        ayuda: {
          what: "Cada caja con quién la abrió, el esperado, lo contado y la diferencia. Toca una para ver cómo se contó y de dónde vino el efectivo.",
          affects: "Los faltantes y sobrantes sólo suman las cajas donde alguien contó. Una caja cerrada sin contar queda como «Cerrada sin conteo».",
          example: "Se esperaban S/ 550 y se contaron S/ 540 → faltante de S/ 10.",
        },
      },
      {
        clave: "reconciliacion",
        rotulo: "Por día",
        ayuda: { what: "Esperado contra real por día, la tendencia de las diferencias y el flujo de efectivo de la semana." },
      },
      {
        clave: "auditoria",
        rotulo: "Quién la tocó",
        ayuda: {
          what: "Aperturas, cierres, ingresos o retiros anotados a mano y correcciones de medio, con el usuario que los hizo. Es un registro de auditoría: no se edita ni se borra.",
          affects: "Las ventas, los adelantos y los cobros de fiado NO salen acá (los anota el sistema, no una persona): están en Movimientos, con su día y hora.",
          example: "Si falta plata, acá ves quién retiró S/ 50 a mano y a qué hora; la venta que la explica la buscas en Movimientos por su código.",
        },
      },
    ],
  },
};

export const GRUPOS: readonly GrupoCaja[] = ["hoy", "historial"];

export function grupoDe(v: VistaCaja): GrupoCaja {
  return SECCIONES.historial.secciones.some((s) => s.clave === v) ? "historial" : "hoy";
}

export function seccionDe(v: VistaCaja): Seccion {
  const lista = SECCIONES[grupoDe(v)].secciones;
  return lista.find((s) => s.clave === v) ?? lista[0];
}

/* La última sección abierta de cada pestaña, por navegador: volver a «Historial»
   te deja donde estabas, y Caja abre en la sección de «Hoy» que usaste último. */
const clave = (g: GrupoCaja) => `caja:seccion:${g}`;

export function seccionRecordada(g: GrupoCaja): VistaCaja {
  const lista = SECCIONES[g].secciones;
  try {
    const v = localStorage.getItem(clave(g));
    const hallada = lista.find((s) => s.clave === v);
    if (hallada) return hallada.clave;
  } catch {
    // modo privado: sin memoria
  }
  return lista[0].clave;
}

export function recordarSeccion(v: VistaCaja) {
  try {
    localStorage.setItem(clave(grupoDe(v)), v);
  } catch {
    // modo privado: sin memoria
  }
}
