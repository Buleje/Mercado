/**
 * Cuándo y cuánto reponer.
 *
 * Vive fuera del endpoint para poder probarlo: es la regla que decide si el
 * negocio gasta plata, y antes estaba enterrada en el handler donde ningún test
 * la alcanzaba. La regla vieja era «rellenar hasta `stockMax`» y en el tenant
 * real proponía comprar 944 unidades de productos con CERO ventas en 30 días.
 *
 * La idea, en una frase: **se repone lo que va a faltar antes de que llegue el
 * pedido**. Todo lo demás sale de ahí.
 */

/** Días de gracia sobre el lead time: nadie pide el día exacto en que se acaba. */
export const COLCHON_DIAS = 3;
/** Cuando no se sabe cuánto tarda el proveedor. Una semana es lo prudente. */
export const LEAD_TIME_DEFAULT = 7;

export type UrgenciaReposicion = "CRITICO" | "URGENTE" | "PLANIFICAR";

/**
 * Por qué entra a la lista (C26): la urgencia dice CUÁNDO, la causa dice POR QUÉ.
 * Dos productos «a planificar» pueden estar ahí por razones distintas: uno por
 * lo que se vende, otro porque bajó del mínimo que fijaste.
 */
export type CausaReposicion = "agotado" | "no_llega" | "durante_entrega" | "minimo" | "ritmo";

/** Con menos de esto la venta diaria es un estimado, no una certeza (C28). */
export const POCOS_DATOS = { vendidas: 3, diasConStock: 7 } as const;

/**
 * Cada número de la cuenta, para que quien mira reconstruya «Pedir N» (C28).
 * Son los MISMOS valores con que se decidió: no se recalculan en la pantalla.
 */
export interface DetalleReposicion {
  vendido: number;
  diasConStock: number;
  ventaDiaria: number;
  leadTimeDias: number;
  colchonDias: number;
  /** Lead time + colchón: los días que el stock tiene que aguantar. */
  diasCobertura: number;
  /** Venta diaria × días a cubrir, antes de mirar el mínimo. */
  porRitmo: number;
  stockMin: number;
  /** El mínimo fijado le gana al ritmo de venta (punto de reorden = mínimo). */
  minimoManda: boolean;
  puntoReorden: number;
  stock: number;
  enTransito: number;
  disponible: number;
  /** A dónde se quiere llegar: dos ciclos de reposición, o el mínimo si es mayor. */
  objetivo: number;
  cantidad: number;
  /** Pocas ventas o pocos días con stock: la venta diaria es un estimado. */
  pocosDatos: boolean;
}

export interface EntradaReposicion {
  /** Lo que hay en el depósito hoy. */
  stock: number;
  /** Unidades ya pedidas y sin recibir. */
  enTransito: number;
  /** Mínimo configurado del producto. */
  stockMin: number;
  /** Unidades vendidas en la ventana. */
  vendido: number;
  /**
   * Días de la ventana en que hubo stock — el denominador honesto. Dividir
   * entre 30 a un producto que estuvo agotado tres semanas lo hace parecer
   * lento justo cuando más falta hace.
   */
  diasConStock: number;
  /** Días que tarda el proveedor. */
  leadTimeDias: number;
}

export type ResultadoReposicion =
  | { tipo: "sin_rotacion"; ventaDiaria: 0; excesoSobreMinimo: number }
  | { tipo: "suficiente"; ventaDiaria: number; puntoReorden: number; diasRestantes: number }
  | {
      tipo: "reponer";
      ventaDiaria: number;
      puntoReorden: number;
      diasRestantes: number;
      cantidad: number;
      urgencia: UrgenciaReposicion;
      causa: CausaReposicion;
      detalle: DetalleReposicion;
    };

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Decide qué hacer con un producto.
 *
 * - `sin_rotacion`: no se vendió una sola unidad. No se repone; se informa el
 *   exceso sobre el mínimo, que es plata parada.
 * - `suficiente`: lo que hay más lo que viene alcanza hasta la próxima entrega.
 * - `reponer`: falta. La cantidad cubre el doble de la ventana de reposición —
 *   pedir justo el punto de reorden obliga a volver a pedir al día siguiente.
 */
export function evaluarReposicion(e: EntradaReposicion): ResultadoReposicion {
  const disponible = e.stock + e.enTransito;

  if (e.vendido <= 0) {
    return {
      tipo: "sin_rotacion",
      ventaDiaria: 0,
      excesoSobreMinimo: Math.max(e.stock - e.stockMin, 0),
    };
  }

  // Piso de medio día: sin él, un producto que se vendió el mismo día en que se
  // cargó daría una velocidad infinita.
  const dias = Math.max(e.diasConStock, 0.5);
  const ventaDiaria = redondear(e.vendido / dias);

  const diasCobertura = e.leadTimeDias + COLCHON_DIAS;
  // El mínimo configurado es un piso, no el criterio: si el bodeguero declaró
  // que nunca quiere bajar de 10, se respeta aunque la rotación diga menos.
  const puntoReorden = redondear(Math.max(ventaDiaria * diasCobertura, e.stockMin));
  const diasRestantes = ventaDiaria > 0 ? redondear(disponible / ventaDiaria) : Infinity;

  if (disponible >= puntoReorden) {
    return { tipo: "suficiente", ventaDiaria, puntoReorden, diasRestantes };
  }

  const porRitmo = redondear(ventaDiaria * diasCobertura);
  const objetivo = redondear(Math.max(ventaDiaria * diasCobertura * 2, e.stockMin));
  const cantidad = Math.max(1, Math.ceil(objetivo - disponible));
  const minimoManda = e.stockMin > porRitmo;

  const urgencia: UrgenciaReposicion =
    // Agotado es lo PEOR que puede pasar. La regla vieja lo mandaba a URGENTE,
    // debajo de un producto que todavía tenía tres días de stock.
    disponible <= 0 ? "CRITICO"
      // No llega a tiempo: se acaba antes de que entre el pedido.
      : diasRestantes <= e.leadTimeDias ? "CRITICO"
        : diasRestantes <= diasCobertura ? "URGENTE"
          : "PLANIFICAR";

  const causa: CausaReposicion =
    disponible <= 0 ? "agotado"
      : diasRestantes <= e.leadTimeDias ? "no_llega"
        : diasRestantes <= diasCobertura ? "durante_entrega"
          : minimoManda ? "minimo"
            : "ritmo";

  const detalle: DetalleReposicion = {
    vendido: e.vendido,
    diasConStock: redondear(e.diasConStock),
    ventaDiaria,
    leadTimeDias: e.leadTimeDias,
    colchonDias: COLCHON_DIAS,
    diasCobertura,
    porRitmo,
    stockMin: e.stockMin,
    minimoManda,
    puntoReorden,
    stock: e.stock,
    enTransito: e.enTransito,
    disponible,
    objetivo,
    cantidad,
    pocosDatos: e.vendido < POCOS_DATOS.vendidas || e.diasConStock < POCOS_DATOS.diasConStock,
  };

  return { tipo: "reponer", ventaDiaria, puntoReorden, diasRestantes, cantidad, urgencia, causa, detalle };
}
