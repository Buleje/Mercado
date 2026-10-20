/**
 * lib/semaforo/indicadores.ts — catálogo del Semáforo del negocio (ADR-508).
 *
 * Cada indicador dice qué mide, en qué unidad, hacia dónde es mejor y qué hacer
 * en cada color. Los umbrales por defecto sirven para CUALQUIER negocio sólo
 * cuando son proporciones o conteos universales (agotados, recompra, días de
 * stock). Los que dependen del tamaño del negocio (pedidos, ticket, caja,
 * costo por cliente nuevo) arrancan en `null` = «Pon tu meta» (gris): cada
 * negocio carga los suyos en `featureFlagsJson.semaforo`.
 *
 * Puro: sin imports de servidor (lo usa también la vista).
 */

export const IDS_INDICADORES = [
  "pedidos_semana",
  "ticket_promedio",
  "ganancia_neta",
  "productos_a_agotados",
  "vencidos_danados",
  "recompra",
  "costo_cliente_nuevo",
  "dias_stock",
  "sin_rotar",
  "caja",
  "ganancia_acumulada",
] as const;

export type IndicadorId = (typeof IDS_INDICADORES)[number];

/** `mayor` = más es mejor · `menor` = menos es mejor · `rango` = verde entre dos valores. */
export type Sentido = "mayor" | "menor" | "rango";
export type Unidad = "soles" | "porcentaje" | "cantidad" | "dias";
export type ColorSemaforo = "verde" | "amarillo" | "rojo" | "sin_meta" | "sin_dato";
/** `bajo` = debajo del piso verde en un indicador de rango (p. ej. stock que dura poco). */
export type TramoAccion = "verde" | "amarillo" | "rojo" | "bajo";

export interface UmbralIndicador {
  /** mayor: verde desde acá · menor: verde hasta acá · rango: piso del verde. */
  verde: number | null;
  /** mayor: amarillo desde acá · menor: amarillo hasta acá · rango: techo del amarillo. */
  amarillo: number | null;
  /** Sólo rango: techo del verde. */
  verdeHasta?: number | null;
}

export interface DefIndicador {
  id: IndicadorId;
  nombre: string;
  unidad: Unidad;
  sentido: Sentido;
  /** Qué mide, para el ⓘ. */
  mide: string;
  umbral: UmbralIndicador;
  acciones: Readonly<Record<"verde" | "amarillo" | "rojo", string>> & { bajo?: string };
}

const SEGUIR = "Seguir así.";

export const INDICADORES: readonly DefIndicador[] = [
  {
    id: "pedidos_semana",
    nombre: "Pedidos por semana",
    unidad: "cantidad",
    sentido: "mayor",
    mide: "Ventas del mostrador más pedidos confirmados, llevados a 7 días.",
    umbral: { verde: null, amarillo: null },
    acciones: { verde: SEGUIR, amarillo: "Revisar fotos y anuncios esta semana.", rojo: "Revisar anuncios y fotos; activar referidos." },
  },
  {
    id: "ticket_promedio",
    nombre: "Ticket promedio",
    unidad: "soles",
    sentido: "mayor",
    mide: "Lo vendido dividido entre la cantidad de ventas y pedidos.",
    umbral: { verde: null, amarillo: null },
    acciones: { verde: SEGUIR, amarillo: "Ofrecer lo que acompaña al cobrar.", rojo: "Ofrecer combos siempre y un monto para envío gratis." },
  },
  {
    id: "ganancia_neta",
    nombre: "Ganancia neta",
    unidad: "porcentaje",
    sentido: "mayor",
    mide: "(Ventas − costo de lo vendido − gastos) ÷ ventas. Sin costo anotado, el costo se estima al 55 %.",
    umbral: { verde: null, amarillo: null },
    acciones: { verde: SEGUIR, amarillo: "Revisar descuentos y gastos del mes.", rojo: "Negociar costos, quitar descuentos, revisar precios." },
  },
  {
    id: "productos_a_agotados",
    nombre: "Productos A agotados",
    unidad: "cantidad",
    sentido: "menor",
    mide: "Productos importantes (los de tu lista A o, sin lista, los que tienen stock mínimo) con stock en 0 hoy.",
    umbral: { verde: 0, amarillo: 1 },
    acciones: { verde: SEGUIR, amarillo: "Recomprar el agotado esta semana.", rojo: "Recomprar ya; subir el punto de recompra." },
  },
  {
    id: "vencidos_danados",
    nombre: "Vencidos o dañados",
    unidad: "cantidad",
    sentido: "menor",
    mide: "Unidades dadas de baja por daño o vencimiento en el período, más las vencidas que siguen en stock.",
    umbral: { verde: 0, amarillo: 2 },
    acciones: { verde: SEGUIR, amarillo: "Revisar cómo se guarda la mercadería.", rojo: "Revisar almacén y vencimientos al comprar." },
  },
  {
    id: "recompra",
    nombre: "Clientes que vuelven",
    unidad: "porcentaje",
    sentido: "mayor",
    mide: "De los clientes con celular que compraron desde el lanzamiento (o en los últimos 90 días), cuántos compraron en 2 días distintos o más.",
    umbral: { verde: 25, amarillo: 15 },
    acciones: { verde: SEGUIR, amarillo: "Escribir a los clientes a los 3, 15 y 30 días.", rojo: "Cumplir el seguimiento de los días 3, 15 y 30." },
  },
  {
    id: "costo_cliente_nuevo",
    nombre: "Costo por cliente nuevo",
    unidad: "soles",
    sentido: "menor",
    mide: "Gastos de anuncios del período ÷ clientes cuya primera compra cae en el período (por celular).",
    umbral: { verde: null, amarillo: null },
    acciones: { verde: SEGUIR, amarillo: "Probar otra foto u otro producto en el anuncio.", rojo: "Cambiar el anuncio; apagar los que no traen mensajes." },
  },
  {
    id: "dias_stock",
    nombre: "Días que dura el stock",
    unidad: "dias",
    sentido: "rango",
    mide: "Stock a costo ÷ costo de lo vendido por día en el período.",
    umbral: { verde: 30, verdeHasta: 45, amarillo: 60 },
    acciones: {
      verde: SEGUIR,
      amarillo: "Comprar menos de lo que se mueve lento.",
      rojo: "Comprar menos de los lentos; moverlos en combos.",
      bajo: "Stock corto: recomprar lo que más sale antes de que se agote.",
    },
  },
  {
    id: "sin_rotar",
    nombre: "Productos sin rotar",
    unidad: "cantidad",
    sentido: "menor",
    mide: "Productos con stock que vendieron menos de 2 unidades en los últimos 60 días (sin contar los que entraron hace menos de 60 días).",
    umbral: { verde: 0, amarillo: 2 },
    acciones: { verde: SEGUIR, amarillo: "No recomprarlos todavía.", rojo: "No se recompran; van a un combo o promoción." },
  },
  {
    id: "caja",
    nombre: "Caja del lunes",
    unidad: "soles",
    sentido: "mayor",
    mide: "Lo que hay en la cuenta, Yape y efectivo, anotado a mano cada lunes.",
    umbral: { verde: null, amarillo: null },
    acciones: { verde: SEGUIR, amarillo: "Cuidar los gastos esta semana.", rojo: "Parar gastos no urgentes; solo recomprar productos A." },
  },
  {
    id: "ganancia_acumulada",
    nombre: "Ganancia desde el lanzamiento",
    unidad: "soles",
    sentido: "mayor",
    mide: "Ventas − costo − gastos desde el día del lanzamiento. Antes del día de la decisión se compara con el ritmo (la meta repartida por día).",
    umbral: { verde: null, amarillo: null },
    acciones: {
      verde: "Pasar a la siguiente etapa.",
      amarillo: "Corregir precios, fotos, anuncios y productos sin poner plata nueva.",
      rojo: "Parar compras y reunirse para decidir.",
    },
  },
];

const POR_ID: ReadonlyMap<IndicadorId, DefIndicador> = new Map(INDICADORES.map((d) => [d.id, d]));

export function defIndicador(id: IndicadorId): DefIndicador {
  const d = POR_ID.get(id);
  if (!d) throw new Error(`Indicador desconocido: ${id}`);
  return d;
}
