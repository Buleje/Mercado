/**
 * valor-del-patio — cuánto vale, en soles, lo que está parado.
 *
 * Medido en Blas (2026-09-15): **0 de 24 guías tienen `costoTotal`** y hay **0
 * consumos** registrados. O sea que hoy, con datos reales, este módulo tiene
 * que contestar «no se puede valorizar» y decir cuántas guías faltan costear.
 * Eso es el punto: un **S/ 0 falso es peor que un guion**, porque un cero se
 * suma, se exporta y termina en un estado de resultados como si fuera plata
 * contada. Un guion manda a costear la guía.
 *
 * El costo del libro entra por m³ de MATERIA PRIMA (troza). Un m³ de producto
 * aserrado se comió `1 / rendimiento` m³ de troza, así que:
 *
 *     costoPorM3DeProducto = costoPorM3DeMateriaPrima / rendimiento
 *
 * Con 0,50 de rendimiento, una troza de S/ 300 el m³ deja producto a S/ 600 el
 * m³. El aserrín y el despunte no se tiran: su costo se reparte en lo que sí
 * salió, que es cómo cuesta cualquier aserradero.
 *
 * PURO: sin fetch ni reloj. Un número que va a un estado de resultados se
 * testea sin navegador.
 */

/** Un consumo de materia prima atado a la corrida, con lo que se sepa del costo. */
export interface ConsumoCosteable {
  volumeM3: number;
  /** Costo por m³ CONGELADO al cierre del período. Manda sobre todo lo demás. */
  costoUnitarioSnap: number | null;
  costoTotalGuia: number | null;
  volumenGuiaM3: number | null;
  gtfNumber: string | null;
}

/** Una guía de ingreso con su plata, para valorizar sin consumos. */
export interface GuiaCosteable {
  gtfNumber: string;
  costoTotal: number | null;
  volumeM3: number | null;
}

/** De dónde salió el costo. Se muestra: un número sin origen se copia sin pensarlo. */
export type OrigenValor = "consumo-congelado" | "consumo" | "guia" | "sin-costo";

export interface CorridaValorizable {
  gtfOrigen: readonly string[];
  costoConsumos: readonly ConsumoCosteable[];
  costoPorGtf: readonly GuiaCosteable[];
  /** % del asiento (0..100) o null. */
  rendimientoPct: number | null;
  producido: number;
  volumenConsumidoM3: number | null;
}

export interface ValorDeCorrida {
  /** S/ por m³ de PRODUCTO. `null` = no se puede saber sin inventar. */
  porM3: number | null;
  origen: OrigenValor;
  /** Qué guías se usaron y cuáles no tenían costo: la pantalla las nombra. */
  guiasUsadas: string[];
  guiasSinCosto: string[];
  /** El rendimiento con el que se convirtió troza→producto (0..1), y de dónde salió. */
  rendimiento: number | null;
  rendimientoDe: "asiento" | "derivado" | "supuesto" | null;
}

/** Soles: dos decimales. Más decimales en plata es precisión inventada. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Un número que sirve para costear. El `0` NO sirve: es lo que deja un
 *  `@default(0)` de un campo que nadie llenó (misma regla que `costo-sugerido`). */
const pos = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) && v > 0 ? v : null;

/** Las GTF se comparan sin espacios ni caja: «gtf-0012» y «GTF-0012 » son una. */
const clave = (g: string | null | undefined) => (g ?? "").trim().toUpperCase();
const visible = (g: string | null | undefined) => (g ?? "").trim();

/**
 * El rendimiento con el que se convierte troza → producto.
 *
 * Prioridad: lo que declara el asiento; si no, lo que se puede derivar de la
 * propia corrida (producido ÷ consumido). Si ninguno sirve, **null**.
 *
 * Y acá va el «no»: NUNCA un 56 % por defecto. El 56 % es el TOPE legal de
 * conversión (ADR-358), no el rendimiento de nadie: usarlo como supuesto
 * valorizaría todo el patio al máximo permitido por ley, que es el número más
 * optimista posible y el único que nadie puede desmentir. Un rendimiento ≤ 0 o
 * > 1 se descarta igual que si no existiera: sacar más producto que troza es un
 * error de carga, no un dato.
 */
function rendimientoDeLaCorrida(c: CorridaValorizable): {
  r: number | null;
  de: ValorDeCorrida["rendimientoDe"];
} {
  const pct = c.rendimientoPct;
  if (pct != null && Number.isFinite(pct)) {
    const r = pct / 100;
    if (r > 0 && r <= 1) return { r, de: "asiento" };
  }
  const prod = pos(c.producido);
  const cons = pos(c.volumenConsumidoM3);
  if (prod != null && cons != null) {
    const r = prod / cons;
    if (r > 0 && r <= 1) return { r, de: "derivado" };
  }
  /* `"supuesto"` existe en el contrato por si algún día el usuario carga SU
     rendimiento histórico y lo pasa como parámetro. Este módulo no lo emite
     jamás por su cuenta: un supuesto que nadie escribió no es un supuesto, es
     una invención. */
  return { r: null, de: null };
}

/** Un promedio ponderado por volumen: Σ(vol × unitario) ÷ Σ vol. */
function ponderado(items: readonly { vol: number; unitario: number; gtf: string }[]): {
  porM3: number;
  guiasUsadas: string[];
} {
  let plata = 0;
  let vol = 0;
  const guias: string[] = [];
  for (const i of items) {
    plata += i.vol * i.unitario;
    vol += i.vol;
    if (i.gtf && !guias.includes(i.gtf)) guias.push(i.gtf);
  }
  return { porM3: plata / vol, guiasUsadas: guias };
}

/**
 * El costo por m³ de materia prima, con la fuente que se usó.
 *
 * Mezclar fuentes está PROHIBIDO: promediar un costo congelado del cierre con
 * uno vivo de hoy da un número que no es ninguno de los dos y que nadie puede
 * reconstruir seis meses después frente a un fiscalizador. Si hay consumos
 * costeables se usan esos y nada más; las guías sueltas son el recurso de
 * cuando la corrida todavía no tiene consumos atados.
 */
function costoMateriaPrima(
  c: CorridaValorizable,
): { porM3: number; origen: Exclude<OrigenValor, "sin-costo">; guiasUsadas: string[] } | null {
  // 1. Costo congelado al cierre: es el que ya se declaró, gana sobre todo.
  const congelados = c.costoConsumos.flatMap((k) => {
    const vol = pos(k.volumeM3);
    const unitario = pos(k.costoUnitarioSnap);
    return vol != null && unitario != null ? [{ vol, unitario, gtf: visible(k.gtfNumber) }] : [];
  });
  if (congelados.length > 0) return { ...ponderado(congelados), origen: "consumo-congelado" };

  // 2. Consumos vivos: el costo de la guía prorrateado por lo que se consumió de ella.
  const vivos = c.costoConsumos.flatMap((k) => {
    const vol = pos(k.volumeM3);
    const total = pos(k.costoTotalGuia);
    const volGuia = pos(k.volumenGuiaM3);
    return vol != null && total != null && volGuia != null
      ? [{ vol, unitario: total / volGuia, gtf: visible(k.gtfNumber) }]
      : [];
  });
  if (vivos.length > 0) return { ...ponderado(vivos), origen: "consumo" };

  /* 3. Sin consumos atados: las guías de origen declaradas. Se pondera por
     volumen —no un promedio simple— porque una guía de 40 m³ y una de 2 m³ no
     pesan igual en lo que costó el patio. Las guías sin costo no entran al
     promedio (bajarían el costo hacia cero) y se nombran aparte. */
  const mapa = new Map<string, number>();
  const volDe = new Map<string, number>();
  for (const g of c.costoPorGtf) {
    const total = pos(g.costoTotal);
    const vol = pos(g.volumeM3);
    if (total != null && vol != null) {
      mapa.set(clave(g.gtfNumber), total / vol);
      volDe.set(clave(g.gtfNumber), vol);
    }
  }
  const guias = c.gtfOrigen.flatMap((g) => {
    const k = clave(g);
    const unitario = mapa.get(k);
    const vol = volDe.get(k);
    return unitario != null && vol != null ? [{ vol, unitario, gtf: visible(g) }] : [];
  });
  if (guias.length > 0) return { ...ponderado(guias), origen: "guia" };

  return null;
}

/**
 * Qué guías tocan a esta corrida y cuáles no tienen plata cargada por NINGUNA
 * vía (ni congelada, ni de la guía viva, ni del catálogo de costos).
 *
 * «Sin costo» es absoluto a propósito, no relativo a la fuente elegida: la
 * pantalla usa esta lista para mandar al operador a costear esas guías, y una
 * guía que sí tiene costo —aunque no haya aportado a la fuente ganadora— no
 * hay que ir a costearla de nuevo.
 */
function guiasDeLaCorrida(c: CorridaValorizable): { candidatas: string[]; sinCosto: string[] } {
  const candidatas: string[] = [];
  const push = (g: string | null | undefined) => {
    const v = visible(g);
    if (v && !candidatas.some((x) => clave(x) === clave(v))) candidatas.push(v);
  };
  for (const g of c.gtfOrigen) push(g);
  for (const k of c.costoConsumos) push(k.gtfNumber);

  const conCostoEnCatalogo = new Set(
    c.costoPorGtf
      .filter((g) => pos(g.costoTotal) != null && pos(g.volumeM3) != null)
      .map((g) => clave(g.gtfNumber)),
  );
  const conCostoEnConsumo = new Set(
    c.costoConsumos
      .filter(
        (k) =>
          pos(k.costoUnitarioSnap) != null ||
          (pos(k.costoTotalGuia) != null && pos(k.volumenGuiaM3) != null),
      )
      .map((k) => clave(k.gtfNumber)),
  );

  const sinCosto = candidatas.filter(
    (g) => !conCostoEnCatalogo.has(clave(g)) && !conCostoEnConsumo.has(clave(g)),
  );
  return { candidatas, sinCosto };
}

/**
 * Cuánto vale el m³ de producto de esta corrida, y por qué.
 *
 * Devuelve `porM3: null` en dos casos, y los dos se reportan como
 * `"sin-costo"`: cuando no hay ninguna plata cargada, y cuando hay plata pero
 * no hay rendimiento con el que convertirla a producto. Los dos son «no se
 * puede saber»; ninguno es cero.
 */
export function valorDeCorrida(c: CorridaValorizable): ValorDeCorrida {
  const { r, de } = rendimientoDeLaCorrida(c);
  const { sinCosto } = guiasDeLaCorrida(c);
  const fuente = costoMateriaPrima(c);

  if (fuente == null || r == null) {
    return {
      porM3: null,
      origen: "sin-costo",
      /* Nada se «usó»: la valorización no salió. Listar guías acá daría la
         impresión de que el número se calculó con ellas. */
      guiasUsadas: [],
      guiasSinCosto: sinCosto,
      rendimiento: r,
      rendimientoDe: de,
    };
  }

  return {
    porM3: r2(fuente.porM3 / r),
    origen: fuente.origen,
    guiasUsadas: fuente.guiasUsadas,
    guiasSinCosto: sinCosto,
    rendimiento: r,
    rendimientoDe: de,
  };
}

/** S/ de una fila concreta. `null` si la corrida no se pudo valorizar — y
 *  `null` se propaga: la fila queda con guion, no con cero. */
export function valorDeFila(v: ValorDeCorrida, volumenM3: number): number | null {
  if (v.porM3 == null) return null;
  if (!Number.isFinite(volumenM3)) return null;
  return r2(v.porM3 * volumenM3);
}

export interface ResumenValor {
  totalSoles: number;
  filasValorizadas: number;
  filasSinValor: number;
  guiasSinCosto: string[];
}

/**
 * El pie de la tabla. `totalSoles` suma SÓLO lo valorizable y por eso viene
 * siempre acompañado de `filasSinValor`: sin ese contador, un total parcial se
 * lee como el total del patio. La pantalla tiene que decir «S/ X de N filas; M
 * sin costo», nunca «S/ X» a secas.
 */
export function resumenDeValor(
  filas: readonly { valor: ValorDeCorrida; volumenM3: number }[],
): ResumenValor {
  let totalSoles = 0;
  let filasValorizadas = 0;
  let filasSinValor = 0;
  const guiasSinCosto: string[] = [];

  for (const f of filas) {
    const soles = valorDeFila(f.valor, f.volumenM3);
    if (soles == null) filasSinValor += 1;
    else {
      totalSoles += soles;
      filasValorizadas += 1;
    }
    /* Se juntan las de TODAS las filas, valorizadas o no: una corrida que se
       valorizó con dos de tres guías igual tiene una guía por costear. */
    for (const g of f.valor.guiasSinCosto) {
      if (!guiasSinCosto.some((x) => clave(x) === clave(g))) guiasSinCosto.push(g);
    }
  }

  return { totalSoles: r2(totalSoles), filasValorizadas, filasSinValor, guiasSinCosto };
}
