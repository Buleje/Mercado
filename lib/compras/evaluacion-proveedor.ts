/**
 * evaluacion-proveedor.ts — cómo te entrega un proveedor, con la cuenta a la
 * vista (C36, noche 17-10).
 *
 * El puntaje anterior (`/api/proveedores/[id]/scorecard`) llamaba «a tiempo» a
 * toda orden cuya última edición cayó dentro de 7 días de creada, contaba las
 * anuladas en la muestra, daba 100 % de puntualidad sin una sola entrega y
 * medía la «consistencia de precios» mezclando productos distintos. Acá:
 *
 *  - Período explícito (últimos N meses por la fecha de la orden).
 *  - Las anuladas no entran a la muestra; se cuentan aparte.
 *  - Puntual = llegó (fecha de recepción) hasta el día prometido. Una orden SIN
 *    fecha prometida no se clasifica: ni a tiempo ni atrasada. Una pendiente
 *    cuya fecha ya pasó sí está atrasada.
 *  - Completa vs parcial se mide aparte del atraso.
 *  - Precio estable = cuánto varió el costo del MISMO producto en la MISMA
 *    unidad entre órdenes, nunca entre productos distintos.
 *  - Lo que no se puede medir no pesa: su peso se reparte entre lo medido.
 *  - Menos de 3 órdenes que llegaron = sin evaluar.
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { claveDeDia, diasEntre } from "./ciclo-oc";

/** Órdenes que tienen que haber llegado para calificar. */
export const MINIMO_PARA_EVALUAR = 3;

/** Períodos que se pueden pedir (meses). */
export const PERIODOS_EVALUACION = [3, 6, 12] as const;
export type PeriodoEvaluacion = (typeof PERIODOS_EVALUACION)[number];

export interface OrdenParaEvaluar {
  id: string;
  /** pendiente | recibido | parcial | cancelado | auto_generated */
  estado: string;
  creada: string;
  /** Fecha prometida de entrega (`deliveryDate`, sin hora). */
  prometida: string | null;
  /** Cuándo llegó entera (`receivedDate`). */
  recibida: string | null;
  items: Array<{ productId: number; unidad: string; costo: number }>;
}

export type ClaveMetrica = "puntualidad" | "completas" | "precio" | "rapidez";

export interface MetricaEvaluacion {
  clave: ClaveMetrica;
  etiqueta: string;
  /** 0-100; `null` = no hay con qué medirla en el período. */
  valor: number | null;
  /** Peso en % sobre 100 antes de repartir lo que no se midió. */
  peso: number;
  /** Cómo salió la cifra, con la muestra: «4 de 5 llegaron hasta el día prometido». */
  detalle: string;
}

export interface EvaluacionProveedor {
  periodo: { meses: number; desde: string; hasta: string };
  muestra: {
    /** Órdenes del período sin las anuladas. */
    ordenes: number;
    anuladas: number;
    pendientes: number;
    llegaron: number;
    completas: number;
    parciales: number;
    aTiempo: number;
    atrasadas: number;
    /** Llegaron o están pendientes, pero nadie anotó cuándo las prometió. */
    sinFechaPrometida: number;
  };
  metricas: MetricaEvaluacion[];
  /** `null` = sin evaluar (no llegó al mínimo). */
  puntaje: number | null;
  nota: "A" | "B" | "C" | "D" | null;
  diasPromedioEntrega: number | null;
  atrasoPromedioDias: number | null;
  minimo: number;
  /** Cómo se arma el puntaje, para el ⓘ. */
  formula: string;
}

const PESOS: Record<ClaveMetrica, number> = { puntualidad: 35, completas: 25, precio: 20, rapidez: 20 };

const ETIQUETAS: Record<ClaveMetrica, string> = {
  puntualidad: "Llega a tiempo",
  completas: "Llega completo",
  precio: "Precio estable",
  rapidez: "Rapidez",
};

export const FORMULA_EVALUACION =
  "Promedio ponderado de lo que se pudo medir: a tiempo 35 %, completo 25 %, precio estable 20 %, rapidez 20 %. " +
  "Lo que no se puede medir no cuenta y su peso se reparte. A desde 85, B desde 70, C desde 55; abajo, D.";

/** El día que empieza el período: hoy menos N meses (mismo día del mes). */
export function inicioDelPeriodo(hoy: string, meses: number): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}

/** El período pedido si es uno de los válidos; si no, 12 meses. */
export function periodoValido(meses: unknown): PeriodoEvaluacion {
  const n = Number(meses);
  return (PERIODOS_EVALUACION as readonly number[]).includes(n) ? (n as PeriodoEvaluacion) : 12;
}

const ANULADA = "cancelado";
const LLEGARON = new Set(["recibido", "parcial"]);

function redondear(n: number): number {
  return Math.round(n);
}

function promedio(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Variación del costo de un mismo producto en la misma unidad (coeficiente de variación). */
function variacionesDePrecio(ordenes: readonly OrdenParaEvaluar[]): number[] {
  const porProducto = new Map<string, number[]>();
  for (const o of ordenes) {
    for (const it of o.items) {
      if (!(it.costo > 0)) continue;
      const k = `${it.productId}|${it.unidad.trim().toLowerCase()}`;
      const lista = porProducto.get(k) ?? [];
      lista.push(it.costo);
      porProducto.set(k, lista);
    }
  }
  const out: number[] = [];
  for (const costos of porProducto.values()) {
    if (costos.length < 2) continue;
    const media = costos.reduce((a, b) => a + b, 0) / costos.length;
    const varianza = costos.reduce((a, c) => a + (c - media) ** 2, 0) / costos.length;
    out.push(Math.sqrt(varianza) / media);
  }
  return out;
}

export function evaluarProveedor(
  ordenesTodas: readonly OrdenParaEvaluar[],
  opciones: { hoy: string; meses: number; diasDeclarados?: number | null },
): EvaluacionProveedor {
  const { hoy, meses } = opciones;
  const desde = inicioDelPeriodo(hoy, meses);
  const delPeriodo = ordenesTodas.filter((o) => {
    const k = claveDeDia(o.creada);
    return k !== null && k >= desde && k <= hoy;
  });
  const anuladas = delPeriodo.filter((o) => o.estado === ANULADA).length;
  // La auto-generada es un borrador que el proveedor nunca recibió: tampoco entra.
  const validas = delPeriodo.filter((o) => o.estado !== ANULADA && o.estado !== "auto_generated");
  const llegaron = validas.filter((o) => LLEGARON.has(o.estado));
  const completas = llegaron.filter((o) => o.estado === "recibido").length;
  const pendientes = validas.length - llegaron.length;

  // Puntualidad: sólo órdenes con fecha prometida.
  let aTiempo = 0;
  let sinFechaPrometida = 0;
  const atrasos: number[] = [];
  for (const o of validas) {
    const prometida = claveDeDia(o.prometida);
    const recibida = claveDeDia(o.recibida);
    const llego = LLEGARON.has(o.estado);
    if (!prometida) {
      if (llego || o.estado === "pendiente") sinFechaPrometida++;
      continue;
    }
    if (llego && recibida) {
      if (recibida <= prometida) aTiempo++;
      else atrasos.push(diasEntre(prometida, recibida));
    } else if (!llego && hoy > prometida) {
      // Pendiente y ya pasó el día prometido: atrasada aunque no haya llegado.
      atrasos.push(diasEntre(prometida, hoy));
    }
    // Parcial sin fecha de recepción todavía y con plazo vigente: no se clasifica aún.
  }
  const atrasadas = atrasos.length;
  const conFecha = aTiempo + atrasadas;

  const diasEntrega = llegaron
    .map((o) => {
      const c = claveDeDia(o.creada);
      const r = claveDeDia(o.recibida);
      return c && r ? Math.max(0, diasEntre(c, r)) : null;
    })
    .filter((d): d is number => d !== null);
  const diasPromedio = promedio(diasEntrega);
  const referencia = opciones.diasDeclarados ?? 2;

  const variaciones = variacionesDePrecio(validas);
  const variacionMedia = promedio(variaciones);

  const metricas: MetricaEvaluacion[] = [
    {
      clave: "puntualidad",
      etiqueta: ETIQUETAS.puntualidad,
      valor: conFecha > 0 ? redondear((aTiempo / conFecha) * 100) : null,
      peso: PESOS.puntualidad,
      detalle:
        conFecha > 0
          ? `${aTiempo} de ${conFecha} llegaron hasta el día prometido${sinFechaPrometida ? `; ${sinFechaPrometida} sin fecha prometida no cuentan` : ""}.`
          : sinFechaPrometida
            ? `Ninguna orden tiene fecha prometida (${sinFechaPrometida} sin fecha): no se puede decir si llega a tiempo.`
            : "Sin órdenes con fecha prometida en el período.",
    },
    {
      clave: "completas",
      etiqueta: ETIQUETAS.completas,
      valor: llegaron.length > 0 ? redondear((completas / llegaron.length) * 100) : null,
      peso: PESOS.completas,
      detalle:
        llegaron.length > 0
          ? `${completas} de ${llegaron.length} llegaron completas${llegaron.length - completas ? `; ${llegaron.length - completas} a medias` : ""}.`
          : "Todavía no llegó ninguna orden en el período.",
    },
    {
      clave: "precio",
      etiqueta: ETIQUETAS.precio,
      valor: variacionMedia !== null ? redondear(Math.max(0, 100 - variacionMedia * 200)) : null,
      peso: PESOS.precio,
      detalle:
        variacionMedia !== null
          ? `${variaciones.length} producto${variaciones.length === 1 ? "" : "s"} comprado${variaciones.length === 1 ? "" : "s"} 2 o más veces en la misma unidad; su costo varió ${redondear(variacionMedia * 100)} % en promedio.`
          : "Ningún producto se compró 2 veces en la misma unidad: no hay con qué comparar el precio.",
    },
    {
      clave: "rapidez",
      etiqueta: ETIQUETAS.rapidez,
      valor: diasPromedio !== null ? redondear(Math.min(100, Math.max(0, 100 - Math.max(0, diasPromedio - referencia) * 15))) : null,
      peso: PESOS.rapidez,
      detalle:
        diasPromedio !== null
          ? `Tarda ${diasPromedio.toFixed(1).replace(".", ",")} días en promedio (${diasEntrega.length} orden${diasEntrega.length === 1 ? "" : "es"}); ${opciones.diasDeclarados != null ? `dijo ${opciones.diasDeclarados}` : "se espera 2"}: −15 por cada día de más.`
          : "Ninguna orden tiene fecha de recepción en el período.",
    },
  ];

  const suficiente = llegaron.length >= MINIMO_PARA_EVALUAR;
  const medidas = metricas.filter((m): m is MetricaEvaluacion & { valor: number } => m.valor !== null);
  const pesoMedido = medidas.reduce((a, m) => a + m.peso, 0);
  const puntaje = suficiente && pesoMedido > 0 ? redondear(medidas.reduce((a, m) => a + m.valor * m.peso, 0) / pesoMedido) : null;
  const nota = puntaje === null ? null : puntaje >= 85 ? "A" : puntaje >= 70 ? "B" : puntaje >= 55 ? "C" : "D";

  return {
    periodo: { meses, desde, hasta: hoy },
    muestra: {
      ordenes: validas.length,
      anuladas,
      pendientes,
      llegaron: llegaron.length,
      completas,
      parciales: llegaron.length - completas,
      aTiempo,
      atrasadas,
      sinFechaPrometida,
    },
    metricas,
    puntaje,
    nota,
    diasPromedioEntrega: diasPromedio !== null ? Math.round(diasPromedio * 10) / 10 : null,
    atrasoPromedioDias: atrasos.length ? Math.round((promedio(atrasos) ?? 0) * 10) / 10 : null,
    minimo: MINIMO_PARA_EVALUAR,
    formula: FORMULA_EVALUACION,
  };
}
