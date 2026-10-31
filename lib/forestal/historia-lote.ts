/**
 * historia-lote — el expediente de un lote de aserrío, de punta a punta.
 *
 * Las cuatro etapas por las que pasa la madera de una pila, en el orden en que
 * ocurren y con el detalle que cada una deja:
 *
 *   ① ARMADO      qué trozas se apartaron, de qué guía y con qué medidas
 *   ② CONSUMO     qué corrida se las comió y cuánto volumen entró a la sierra
 *   ③ PRODUCCIÓN  qué salió: paquetes, tipo, presentación, piezas y m³
 *   ④ SALIDA      con qué GTF se fue, a dónde, y junto a qué otros lotes
 *
 * ── Por qué existe, si ya hay una «cadena del lote» ────────────────────────
 * `ctp-cadena-lote.ts` (ADR-315) recorre el lote **COMERCIAL** (`ForestProdLote`),
 * que agrupa corridas ya hechas para venderlas. Este recorre el lote de
 * **ASERRÍO** (`ForestLoteAserrio`), que es la pila física que entra a la
 * sierra. Son dos cosas distintas con el mismo nombre en castellano: el
 * comercial viaja por la CORRIDA, el de aserrío viaja por la TROZA
 * (`WoodEntryTroza.loteAserrioId`) — una corrida come de dos pilas y una pila se
 * parte en dos corridas, así que agrupar por corrida inventa un 1:1 que no
 * existe (ADR-354).
 *
 * ── La regla que manda acá: NO se prorratea ────────────────────────────────
 * El tramo de salida es el único que se construye de cero, y es donde está la
 * trampa. Un despacho toma producto de una corrida (`ForestCtpDespachoOrigen`),
 * y una corrida puede haber comido trozas de DOS lotes. Cuando eso pasa, no hay
 * ningún dato que diga qué mitad del despacho salió de cuál pila — y repartirlo
 * por regla de tres fabricaría una trazabilidad que nadie midió. Se declara
 * como hueco y se muestra el despacho completo marcado como compartido, igual
 * que hace ADR-315 y por la misma razón por la que I1-I5 usan `≤` y nunca `==`.
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

/** Redondeo del libro: 4 decimales, la precisión del schema. */
const r4 = (n: number): number => Number(n.toFixed(4));
/** Debajo de esto un volumen es ruido de coma flotante, no madera. */
const EPS = 1e-4;

// ── Lo que entra ────────────────────────────────────────────────────────────

export interface LoteHistoriaInput {
  id: string;
  code: string;
  speciesCommon: string | null;
  speciesScientific: string | null;
  status: string;
  notes: string | null;
  tipoProductoConsumir: string | null;
  fechaApertura: string | null;
  fechaConsumo: string | null;
  inicioProceso: string | null;
  finProceso: string | null;
  createdBy: string | null;
}

export interface TrozaHistoriaInput {
  id: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  especieComun: string | null;
  gtfNumber: string | null;
  permiso: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  volumenM3: number | null;
  /** Corrida VIVA que se la comió; `null` = sigue en la pila. */
  consumidaEnId: string | null;
  /** Salió en camión sin aserrar (ADR-363). */
  despachadaEnId: string | null;
  noRecepcionada: boolean;
  descarte: boolean;
}

export interface PaqueteHistoriaInput {
  id: string;
  codigo: string | null;
  productType: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
}

export interface CorridaHistoriaInput {
  id: string;
  lineNo: number | null;
  entryDate: string;
  productType: string | null;
  speciesCommon: string | null;
  /** Lo declarado como producido. `null` = corrida abierta (ADR-364). */
  quantity: number | null;
  unit: string | null;
  /** Materia prima que entró. Es el denominador del rendimiento. */
  volumeInputM3: number | null;
  status: string;
  observations: string | null;
  paquetes: PaqueteHistoriaInput[];
}

export interface DespachoHistoriaInput {
  id: string;
  lineNo: number | null;
  entryDate: string;
  gtfNumber: string | null;
  destino: string | null;
  unit: string | null;
  status: string;
}

/** Una atribución `despacho ← corrida` (`ForestCtpDespachoOrigen`). */
export interface OrigenHistoriaInput {
  despachoEntryId: string;
  produccionEntryId: string;
  quantity: number;
}

/** De qué lote de aserrío salió cada corrida. Una corrida puede estar en varios. */
export interface CorridaDeLoteInput {
  produccionEntryId: string;
  loteId: string;
  loteCode: string;
}

export interface EntradaHistoriaLote {
  lote: LoteHistoriaInput;
  /** Las trozas apartadas en ESTE lote. */
  trozas: TrozaHistoriaInput[];
  /** Las corridas que consumieron trozas de este lote (o que lo cerraron). */
  corridas: CorridaHistoriaInput[];
  /**
   * TODOS los orígenes de los despachos que tocaron esas corridas — incluidos
   * los de corridas ajenas. Sin los ajenos no se puede decir con quién viajó.
   */
  origenes: OrigenHistoriaInput[];
  despachos: DespachoHistoriaInput[];
  /** El mapa corrida → lote, para poder nombrar a los compañeros de viaje. */
  corridasDeLotes: CorridaDeLoteInput[];
}

// ── Lo que sale ─────────────────────────────────────────────────────────────

export interface EtapaArmado {
  fecha: string | null;
  trozas: TrozaHistoriaInput[];
  piezas: number;
  m3: number;
  /** Las guías de las que salieron esas piezas, sin repetir. */
  guias: string[];
  /** Piezas que están en la pila pero NO pueden ir a la sierra, y por qué. */
  fueraDeJuego: { codigo: string; motivo: string }[];
}

export interface EtapaConsumo {
  corridas: Array<{
    id: string;
    lineNo: number | null;
    fecha: string;
    m3: number;
    /** Piezas de ESTE lote que entraron en esa corrida. */
    piezasDelLote: number;
    m3DelLote: number;
    abierta: boolean;
  }>;
  m3Total: number;
  piezasConsumidas: number;
}

export interface EtapaProduccion {
  corridas: Array<{
    id: string;
    lineNo: number | null;
    fecha: string;
    producto: string | null;
    cantidad: number | null;
    unit: string | null;
    paquetes: PaqueteHistoriaInput[];
  }>;
  /** Total producido, sólo si todas las corridas comparten unidad. */
  total: { cantidad: number; unit: string } | null;
  piezas: number;
  paquetes: number;
  /** producido ÷ consumido, en %. `null` si no hay consumo o unidades mezcladas. */
  rendimientoPct: number | null;
}

export interface SalidaDelLote {
  despachoEntryId: string;
  lineNo: number | null;
  fecha: string;
  gtfNumber: string | null;
  destino: string | null;
  unit: string | null;
  /** Lo que salió de corridas de ESTE lote en esa guía. */
  deEsteLote: number;
  /** Todo lo que llevó la guía, de cualquier origen. */
  totalDeLaGuia: number;
  /** Con quién compartió camión. `loteCode: null` = corrida sin lote de aserrío. */
  companeros: Array<{ loteCode: string | null; cantidad: number }>;
  /**
   * `true` si alguna de las corridas que aportó a esta guía pertenece TAMBIÉN a
   * otro lote: entonces «lo de este lote» es un techo, no una medición.
   */
  compartida: boolean;
}

export interface EtapaSalida {
  despachos: SalidaDelLote[];
  total: number;
  /** Producido que todavía no salió. Nunca negativo. */
  enStock: number;
}

/**
 * Cuánto tardó la madera entre una etapa y la siguiente.
 *
 * Es la lectura que ninguna tabla del libro da y con la que se decide: una pila
 * que espera 40 días antes de entrar a la sierra se degrada, y un lote aserrado
 * que lleva tres meses sin salir es plata quieta. `null` cuando el tramo
 * todavía no ocurrió — no 0, que se leería como «fue inmediato».
 */
export interface TiemposDelLote {
  /** Del armado al primer consumo. */
  esperaEnPatio: number | null;
  /** Del consumo al primer despacho. */
  hastaLaSalida: number | null;
  /** Del armado a hoy, si todavía no salió todo. */
  edad: number | null;
}

export interface HistoriaLote {
  lote: LoteHistoriaInput;
  armado: EtapaArmado;
  consumo: EtapaConsumo;
  produccion: EtapaProduccion;
  salida: EtapaSalida;
  tiempos: TiemposDelLote;
  /** Lo que la cadena NO puede afirmar. Va arriba, no al pie. */
  huecos: string[];
}

// ── El recorrido ────────────────────────────────────────────────────────────

/** Una corrida cuenta si no está anulada: una anulada devolvió la madera al patio. */
const corridaViva = (c: { status: string }) => c.status !== "anulado";

/** Días enteros entre dos instantes; `null` si falta alguno o va para atrás. */
function diasEntre(desde: string | null | undefined, hasta: string | null | undefined): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.floor((b - a) / 86_400_000);
}

export function construirHistoriaLote(e: EntradaHistoriaLote, ahora = Date.now()): HistoriaLote {
  const huecos: string[] = [];
  const corridas = e.corridas.filter(corridaViva);
  const idsDelLote = new Set(corridas.map((c) => c.id));

  // ── ① ARMADO ──────────────────────────────────────────────────────────────
  const guias = [...new Set(e.trozas.map((t) => t.gtfNumber).filter((g): g is string => Boolean(g)))].sort();
  /* Una pieza que no llegó, que se descartó o que ya salió en rollo está en la
     lista del lote pero no puede ir a la sierra. Decirlo evita que alguien sume
     el volumen del lote y no le cierre contra lo que entró. */
  const fueraDeJuego = e.trozas
    .map((t) => {
      const codigo = t.codigoPlanta || t.codificacion || t.id.slice(0, 8);
      if (t.noRecepcionada) return { codigo, motivo: "no llegó a la planta (ADR-325)" };
      if (t.descarte) return { codigo, motivo: "marcada como descarte" };
      if (t.despachadaEnId) return { codigo, motivo: "salió en camión sin aserrar (ADR-363)" };
      return null;
    })
    .filter((x): x is { codigo: string; motivo: string } => x !== null);

  const armado: EtapaArmado = {
    fecha: e.lote.fechaApertura,
    trozas: e.trozas,
    piezas: e.trozas.length,
    m3: r4(e.trozas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0)),
    guias,
    fueraDeJuego,
  };

  // ── ② CONSUMO ─────────────────────────────────────────────────────────────
  /* Las piezas se cuentan contra la corrida que las tomó. Una troza cuya
     corrida está anulada NO cuenta: volvió a la pila. */
  const porCorrida = new Map<string, { piezas: number; m3: number }>();
  let piezasConsumidas = 0;
  for (const t of e.trozas) {
    if (!t.consumidaEnId || !idsDelLote.has(t.consumidaEnId)) continue;
    const acc = porCorrida.get(t.consumidaEnId) ?? { piezas: 0, m3: 0 };
    acc.piezas += 1;
    acc.m3 += t.volumenM3 ?? 0;
    porCorrida.set(t.consumidaEnId, acc);
    piezasConsumidas += 1;
  }

  const consumo: EtapaConsumo = {
    corridas: corridas.map((c) => {
      const p = porCorrida.get(c.id) ?? { piezas: 0, m3: 0 };
      return {
        id: c.id,
        lineNo: c.lineNo,
        fecha: c.entryDate,
        m3: r4(c.volumeInputM3 ?? 0),
        piezasDelLote: p.piezas,
        m3DelLote: r4(p.m3),
        abierta: c.quantity == null,
      };
    }),
    m3Total: r4(corridas.reduce((a, c) => a + (c.volumeInputM3 ?? 0), 0)),
    piezasConsumidas,
  };

  if (consumo.corridas.some((c) => c.abierta)) {
    const abiertas = consumo.corridas.filter((c) => c.abierta);
    huecos.push(
      `${abiertas.length === 1 ? "Una corrida todavía no declaró" : `${abiertas.length} corridas todavía no declararon`} qué salió (N° ${abiertas.map((c) => c.lineNo ?? "?").join(", ")}): el rendimiento del lote está incompleto hasta que se declare.`,
    );
  }

  // ── ③ PRODUCCIÓN ──────────────────────────────────────────────────────────
  const unidades = [...new Set(corridas.filter((c) => c.quantity != null).map((c) => c.unit ?? "m3"))];
  const producidoTotal = corridas.reduce((a, c) => a + (c.quantity ?? 0), 0);
  const produccion: EtapaProduccion = {
    corridas: corridas.map((c) => ({
      id: c.id,
      lineNo: c.lineNo,
      fecha: c.entryDate,
      producto: c.productType,
      cantidad: c.quantity,
      unit: c.unit,
      paquetes: c.paquetes,
    })),
    /* Con unidades mezcladas no hay total: sumar pies tablares con metros
       cúbicos da un número con aspecto de verdad. */
    total: unidades.length === 1 ? { cantidad: r4(producidoTotal), unit: unidades[0] } : null,
    piezas: corridas.reduce((a, c) => a + c.paquetes.reduce((s, p) => s + p.cantidad, 0), 0),
    paquetes: corridas.reduce((a, c) => a + c.paquetes.length, 0),
    rendimientoPct: null,
  };
  if (unidades.length > 1) {
    huecos.push(
      `Las corridas de este lote declaran en unidades distintas (${unidades.join(", ")}): no hay un total ni un rendimiento que se puedan sumar.`,
    );
  }
  /* Rendimiento sólo con las dos puntas y en la misma unidad que la materia
     prima. Sin producción declarada es `null`, nunca 0: un 0 % acusa una
     pérdida donde hay una jornada a medio terminar. */
  if (consumo.m3Total > EPS && producidoTotal > EPS && unidades.length === 1 && unidades[0] === "m3") {
    produccion.rendimientoPct = Number(((producidoTotal / consumo.m3Total) * 100).toFixed(2));
  }

  // ── ④ SALIDA ──────────────────────────────────────────────────────────────
  /* Qué lotes alimenta cada corrida. Si una corrida está en más de uno, lo que
     salga de ella no se puede repartir: se marca compartida. */
  const lotesDeCorrida = new Map<string, Set<string>>();
  for (const r of e.corridasDeLotes) {
    const s = lotesDeCorrida.get(r.produccionEntryId) ?? new Set<string>();
    s.add(r.loteCode);
    lotesDeCorrida.set(r.produccionEntryId, s);
  }
  const codigoDeCorrida = (id: string): string | null => {
    const s = lotesDeCorrida.get(id);
    if (!s || s.size === 0) return null;
    // Con más de uno, el nombre no identifica: se resuelve arriba como hueco.
    return [...s].sort().join(" + ");
  };

  const despachoPorId = new Map(e.despachos.filter(corridaViva).map((d) => [d.id, d]));
  const porDespacho = new Map<string, OrigenHistoriaInput[]>();
  for (const o of e.origenes) {
    if (!despachoPorId.has(o.despachoEntryId)) continue; // anulado o borrado
    porDespacho.set(o.despachoEntryId, [...(porDespacho.get(o.despachoEntryId) ?? []), o]);
  }

  const salidas: SalidaDelLote[] = [];
  for (const [despachoId, origenes] of porDespacho) {
    const propios = origenes.filter((o) => idsDelLote.has(o.produccionEntryId));
    if (propios.length === 0) continue; // esa guía no tocó este lote
    const d = despachoPorId.get(despachoId)!;

    const deEsteLote = propios.reduce((a, o) => a + o.quantity, 0);
    const totalDeLaGuia = origenes.reduce((a, o) => a + o.quantity, 0);

    /* Los compañeros: todo lo que NO salió de corridas de este lote, agrupado
       por el lote del que sí salió. Una corrida sin lote de aserrío va bajo
       `null` y la pantalla la nombra «sin lote» — descartarla dejaría el total
       de la guía sin explicar. */
    const porLote = new Map<string | null, number>();
    for (const o of origenes) {
      if (idsDelLote.has(o.produccionEntryId)) continue;
      const code = codigoDeCorrida(o.produccionEntryId);
      porLote.set(code, (porLote.get(code) ?? 0) + o.quantity);
    }

    const compartida = propios.some((o) => (lotesDeCorrida.get(o.produccionEntryId)?.size ?? 0) > 1);
    if (compartida) {
      huecos.push(
        `La guía ${d.gtfNumber ?? `N° ${d.lineNo ?? "?"}`} salió de una corrida que este lote comparte con otro: lo que dice «de este lote» es un techo, no una medición. No se prorratea.`,
      );
    }

    salidas.push({
      despachoEntryId: despachoId,
      lineNo: d.lineNo,
      fecha: d.entryDate,
      gtfNumber: d.gtfNumber,
      destino: d.destino,
      unit: d.unit,
      deEsteLote: r4(deEsteLote),
      totalDeLaGuia: r4(totalDeLaGuia),
      companeros: [...porLote.entries()]
        .map(([loteCode, cantidad]) => ({ loteCode, cantidad: r4(cantidad) }))
        .sort((a, b) => b.cantidad - a.cantidad),
      compartida,
    });
  }
  salidas.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.lineNo ?? 0) - (b.lineNo ?? 0));

  const totalSalido = r4(salidas.reduce((a, s) => a + s.deEsteLote, 0));
  const salida: EtapaSalida = {
    despachos: salidas,
    total: totalSalido,
    // Nunca negativo: si sale más de lo producido, eso es una excepción del
    // libro (I3) y se reporta allá, no restando acá hasta el absurdo.
    enStock: r4(Math.max(0, producidoTotal - totalSalido)),
  };

  // ── Los tiempos ───────────────────────────────────────────────────────────
  const primerConsumo = consumo.corridas.map((c) => c.fecha).sort()[0] ?? null;
  const primerDespacho = salidas[0]?.fecha ?? null;
  const tiempos: TiemposDelLote = {
    esperaEnPatio: diasEntre(armado.fecha, primerConsumo),
    hastaLaSalida: diasEntre(primerConsumo, primerDespacho),
    /* La edad sólo cuenta mientras quede algo adentro: un lote que ya salió
       entero no «tiene» días, tiene una historia cerrada. */
    edad: salida.enStock > EPS ? diasEntre(armado.fecha, new Date(ahora).toISOString()) : null,
  };

  return { lote: e.lote, armado, consumo, produccion, salida, tiempos, huecos };
}
