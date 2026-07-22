/**
 * loth-analitica — la lectura del aprovechamiento: qué pasó con cada m³ que
 * salió del bosque, dónde se perdió y qué especie deja plata.
 *
 * POR QUÉ EXISTE (bug de fondo, no cosmético): el panel dibujaba las etapas
 * como una cascada secuencial —tala 100% → trozado 98% → despacho 55% →
 * consumo 42%— dando a entender que entre trozado y despacho se evapora el
 * 43% del volumen. No es así: una troza **o** se vende en rollo **o** entra a
 * planta. Son dos RAMAS de la misma bifurcación:
 *
 *     despachoTrozaM3 + consumidoM3 = trozadoM3
 *
 * Con los datos reales del libro: 2,761 + 2,126 = 4,887. Exacto. Presentarlas
 * en fila hacía ver una merma inventada del 45% y escondía la única merma real
 * de esa etapa (la del aserrío). Acá el flujo se modela como es: un tronco
 * (bosque → trozado) que se bifurca, y una de las ramas vuelve a transformarse.
 *
 * PURO y client-safe.
 */

/** Volúmenes crudos que devuelve el endpoint de analítica. */
export interface FunnelRaw {
  taladoM3: number;
  trozadoM3: number;
  despachoTrozaM3: number;
  consumidoM3: number;
  productoCantidad: number;
  despachoProductoM3: number;
}

export type NodoTipo = "origen" | "transformacion" | "salida" | "rama";

export interface NodoFlujo {
  key: string;
  label: string;
  /** Qué es esto en una línea, para que el número se entienda solo. */
  detalle: string;
  m3: number;
  /** % sobre el volumen talado (el total del que todo desciende). */
  pctDelTotal: number;
  /** % sobre el nodo del que sale (null en el origen). */
  pctDelPadre: number | null;
  tipo: NodoTipo;
  /** Profundidad para la sangría del dibujo. */
  nivel: number;
}

export interface Merma {
  key: string;
  label: string;
  m3: number;
  /** % perdido respecto de lo que entró a esa etapa. */
  pct: number;
  explicacion: string;
}

export interface FlujoAprovechamiento {
  nodos: NodoFlujo[];
  mermas: Merma[];
  /** Suma de las mermas identificadas. */
  mermaTotalM3: number;
  /** trozado / talado — el rendimiento de la primera transformación. */
  rendimientoTrozadoPct: number | null;
  /** producto despachado / consumido — el rendimiento del aserrío. */
  rendimientoAserrioPct: number | null;
  /** Qué parte de lo trozado se vendió en rollo (sin transformar). */
  ventaEnRolloPct: number | null;
  /**
   * true si `despachoTroza + consumido` no cuadra con `trozado`. No es un error
   * del cálculo: significa que hay trozas en patio sin destino todavía.
   */
  hayStockEnPatio: boolean;
  stockEnPatioM3: number;
  totalM3: number;
}

const r4 = (n: number): number => Number((Number.isFinite(n) ? n : 0).toFixed(4));
const pct = (parte: number, total: number): number | null =>
  total > 0 ? Number(((parte / total) * 100).toFixed(1)) : null;

/**
 * Arma el flujo real del aprovechamiento a partir de los volúmenes del libro.
 *
 * Estructura resultante:
 *   Tala (origen)
 *     └ Trozado (transformación)   ← merma de trozado
 *         ├ Vendido en rollo (rama → salida)
 *         └ A planta / aserrío (rama)   ← merma de aserrío
 *             └ Producto despachado (salida)
 */
export function construirFlujo(f: FunnelRaw): FlujoAprovechamiento {
  const talado = r4(Math.max(0, f.taladoM3));
  const trozado = r4(Math.max(0, f.trozadoM3));
  const rollo = r4(Math.max(0, f.despachoTrozaM3));
  const planta = r4(Math.max(0, f.consumidoM3));
  const producto = r4(Math.max(0, f.despachoProductoM3));

  const nodos: NodoFlujo[] = [
    {
      key: "tala", label: "Tala", detalle: "árboles tumbados en el bosque",
      m3: talado, pctDelTotal: 100, pctDelPadre: null, tipo: "origen", nivel: 0,
    },
    {
      key: "trozado", label: "Trozado", detalle: "trozas obtenidas del fuste",
      m3: trozado, pctDelTotal: pct(trozado, talado) ?? 0, pctDelPadre: pct(trozado, talado), tipo: "transformacion", nivel: 1,
    },
    {
      key: "rollo", label: "Vendido en rollo", detalle: "trozas despachadas sin transformar",
      m3: rollo, pctDelTotal: pct(rollo, talado) ?? 0, pctDelPadre: pct(rollo, trozado), tipo: "salida", nivel: 2,
    },
    {
      key: "planta", label: "A planta (aserrío)", detalle: "trozas que entraron a transformación",
      m3: planta, pctDelTotal: pct(planta, talado) ?? 0, pctDelPadre: pct(planta, trozado), tipo: "rama", nivel: 2,
    },
    {
      key: "producto", label: "Producto despachado", detalle: "madera transformada que salió de planta",
      m3: producto, pctDelTotal: pct(producto, talado) ?? 0, pctDelPadre: pct(producto, planta), tipo: "salida", nivel: 3,
    },
  ];

  const mermas: Merma[] = [];
  const mermaTrozado = r4(Math.max(0, talado - trozado));
  if (mermaTrozado > 0) {
    mermas.push({
      key: "trozado", label: "Merma de trozado", m3: mermaTrozado, pct: pct(mermaTrozado, talado) ?? 0,
      explicacion: "Tocón, copa y despuntes que quedan en el bosque: la diferencia entre el árbol tumbado y las trozas que salen.",
    });
  }
  const mermaAserrio = r4(Math.max(0, planta - producto));
  if (planta > 0 && mermaAserrio > 0) {
    mermas.push({
      key: "aserrio", label: "Merma de aserrío", m3: mermaAserrio, pct: pct(mermaAserrio, planta) ?? 0,
      explicacion: "Aserrín, costaneras y recortes de la transformación. Es la merma que más se puede mejorar con mejor sierra y mejor corte.",
    });
  }

  // Si lo trozado no se repartió entero entre las dos ramas, el resto es stock.
  const repartido = r4(rollo + planta);
  const stock = r4(Math.max(0, trozado - repartido));

  return {
    nodos,
    mermas,
    mermaTotalM3: r4(mermas.reduce((s, m) => s + m.m3, 0)),
    rendimientoTrozadoPct: pct(trozado, talado),
    rendimientoAserrioPct: planta > 0 ? pct(producto, planta) : null,
    ventaEnRolloPct: trozado > 0 ? pct(rollo, trozado) : null,
    hayStockEnPatio: stock > 0.0001,
    stockEnPatioM3: stock,
    totalM3: talado,
  };
}

// ─── Veredicto del libro ────────────────────────────────────────────────────

export type VeredictoNivel = "ok" | "atencion" | "riesgo";

export interface Veredicto {
  nivel: VeredictoNivel;
  titulo: string;
  /** Motivos concretos, ya ordenados por gravedad. */
  motivos: string[];
}

export interface VeredictoInput {
  errores: number;
  alertas: number;
  especiesFueraDePlan: number;
  saldoNegativo: boolean;
  diasParaAgotar: number | null;
  margenPctTotal: number | null;
}

/**
 * Resume en una línea si el libro está para mostrar o para corregir. Reemplaza
 * al "0 anomalías" suelto, que no distinguía un libro sano de uno vacío.
 */
export function veredictoLibro(v: VeredictoInput): Veredicto {
  const motivos: string[] = [];
  let nivel: VeredictoNivel = "ok";

  if (v.especiesFueraDePlan > 0) {
    nivel = "riesgo";
    motivos.push(
      `${v.especiesFueraDePlan} ${v.especiesFueraDePlan === 1 ? "especie aprovechada no figura" : "especies aprovechadas no figuran"} en la resolución: es infracción, no un descuadre.`,
    );
  }
  if (v.saldoNegativo) {
    nivel = "riesgo";
    motivos.push("Hay especies con saldo negativo: se movilizó más de lo autorizado.");
  }
  if (v.errores > 0) {
    nivel = "riesgo";
    motivos.push(`${v.errores} ${v.errores === 1 ? "anomalía grave" : "anomalías graves"} en el cruce del libro.`);
  }
  if (v.alertas > 0 && nivel !== "riesgo") nivel = "atencion";
  if (v.alertas > 0) motivos.push(`${v.alertas} ${v.alertas === 1 ? "alerta" : "alertas"} para revisar.`);

  if (v.diasParaAgotar != null && v.diasParaAgotar < 60) {
    if (nivel === "ok") nivel = "atencion";
    motivos.push(`Al ritmo actual el saldo autorizado se agota en ${v.diasParaAgotar} días.`);
  }
  if (v.margenPctTotal != null && v.margenPctTotal < 0) {
    if (nivel === "ok") nivel = "atencion";
    motivos.push(`El margen del aprovechamiento está en ${v.margenPctTotal}%: se está vendiendo por debajo del costo.`);
  }

  const titulo = nivel === "riesgo"
    ? "El libro tiene observaciones que un fiscalizador va a marcar"
    : nivel === "atencion"
      ? "El libro cierra, pero hay cosas para mirar"
      : "El libro está consistente y en regla";

  return { nivel, titulo, motivos };
}

// ─── Ranking de rentabilidad ────────────────────────────────────────────────

export interface CosteoRowRaw {
  species: string;
  cites: boolean;
  movilizadoM3: number;
  precioVentaM3: number;
  costoTotalM3: number;
  margenM3: number;
  margenPct: number;
  ingreso: number;
  costo: number;
  margen: number;
  desglose: { venM3: number; extraccionM3: number; transformacionM3: number; fleteM3: number };
}

export interface RankingItem extends CosteoRowRaw {
  /** Participación en el margen total ya generado (0–100). */
  participacionPct: number | null;
  /** true si la especie rinde pero todavía no se movilizó nada. */
  potencial: boolean;
}

/**
 * Ordena las especies por lo que APORTAN de verdad (margen ya generado) y deja
 * al final —marcadas como potencial— las que rinden por m³ pero aún no se
 * movilizaron. La tabla anterior las mezclaba, así que una especie con S/ 0,00
 * generado aparecía arriba por tener buen margen teórico.
 */
export function rankingRentabilidad(rows: CosteoRowRaw[]): RankingItem[] {
  const margenTotal = rows.reduce((s, r) => s + Math.max(0, r.margen), 0);
  return rows
    .map((r) => ({
      ...r,
      participacionPct: margenTotal > 0 ? Number(((Math.max(0, r.margen) / margenTotal) * 100).toFixed(1)) : null,
      potencial: r.movilizadoM3 <= 0.0001,
    }))
    .sort((a, b) => {
      if (a.potencial !== b.potencial) return a.potencial ? 1 : -1;
      return a.potencial ? b.margenM3 - a.margenM3 : b.margen - a.margen;
    });
}

/** Partes del costo de un m³, para dibujarlas apiladas en vez de en texto. */
export function tramosCosto(d: CosteoRowRaw["desglose"], costoTotal: number): { key: string; label: string; valor: number; pct: number }[] {
  const partes = [
    { key: "ven", label: "Derecho (VEN)", valor: d.venM3 },
    { key: "extraccion", label: "Extracción", valor: d.extraccionM3 },
    { key: "transformacion", label: "Transformación", valor: d.transformacionM3 },
    { key: "flete", label: "Flete", valor: d.fleteM3 },
  ];
  const total = costoTotal > 0 ? costoTotal : partes.reduce((s, p) => s + p.valor, 0);
  return partes
    .filter((p) => p.valor > 0)
    .map((p) => ({ ...p, pct: total > 0 ? Number(((p.valor / total) * 100).toFixed(1)) : 0 }));
}
