/**
 * trozas-para-bloque — qué trozas del grupo ampara de verdad un bloque
 * (ADR-519, fase 1 del recorrido del permiso).
 *
 * Un bloque sembrado desde Capacidad lleva TODAS las trozas de su grupo
 * (permiso + especie + fuente), también las que no bajaron del camión. Si el
 * lote y las jornadas las consumen todas, el Libro dice que se aserraron
 * 96,957 m³ para amparar 10 m³: el rendimiento queda falso y las trozas que
 * siguen físicamente en el patio figuran aserradas.
 *
 * Reglas de Brandon (27-10):
 *  · **Trozas enteras** (T1, ADR-373): una troza no se parte.
 *  · **Primero las que llegaron antes al patio** (recepción de la troza → la de
 *    su guía → el asiento de la guía); a igual fecha, por `id` (determinista:
 *    la pantalla y el servidor eligen lo mismo).
 *  · Objetivo de rolliza = máx(usado ÷ % aprovechable, usado ÷ 0,56): ni menos
 *    de lo que dice el aprovechamiento del bloque, ni menos de lo que deja el
 *    tope del 56 %.
 *  · **Cada día ≤ su tope**: a cada jornada le tocan trozas hasta que su
 *    producción quede bajo el 56 % de su rolliza.
 *  · Medidas (ADR-505): si una pieza del reparto sólo sale de ciertas trozas,
 *    se elige primero la que llegó antes de las que la dan.
 *  · Si no alcanza, se elige lo que hay y el faltante queda en `faltaM3`
 *    (siempre `≤`, nunca se fuerza: I1/I2).
 *
 * Quién no entra: la que el servidor marca no elegible (`motivoNoElegible`, el
 * mismo texto), la «por recepcionar», la de un día de mes cerrado y la que no
 * es del bloque. Todas salen en `descartadas` con su porqué.
 *
 * PURO y client-safe: sin DB, sin React, sin `window`. La misma función corre
 * en la pantalla (previsualizar) y en `POST /distribuciones/trozas-para-bloque`.
 */
import { APROVECHABLE_DEFAULT, type BloqueDistribuido, type BloqueRolliza } from "./cubicacion-reparto";
import { elegibilidad, type PiezaMedida, type TrozaMedida } from "./medida-cabe-en-troza";
import { RENDIMIENTO_TOPE_PCT, topeDeclarableM3 } from "./produccion-paquetes";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
/** Un litro: la tolerancia con la que el servidor compara contra el tope. */
const TOL_M3 = 0.001;

/** Una troza que se puede proponer, tal como la lee el servidor (o la pantalla). */
export interface TrozaCandidata {
  id: string;
  volumenM3: number;
  /** Cuándo llegó al patio (ISO). Sin fecha va al final: no se sabe si llegó antes. */
  llegaISO?: string | null;
  /** Código de planta o codificación, para mostrarla. */
  etiqueta?: string | null;
  medidas?: TrozaMedida | null;
  /** Anotada pero sin bajar del camión. */
  porRecepcionar?: boolean;
  /** Por qué no se puede consumir (el texto de `motivoNoElegible`); `null` = puede. */
  motivo?: string | null;
}

/** Un día del bloque: lo que se aserró y, si cae en mes cerrado, cuál. */
export interface DiaParaElegir {
  dia: number;
  m3: number;
  /** Etiqueta del período cerrado en que cae el día (`null` = abierto). */
  cerrado?: string | null;
}

/**
 * Lo que la elección necesita del bloque. Un `BloqueDistribuido` entra tal
 * cual (sus `porDia` y `asignado` traen lo pedido); el endpoint arma uno
 * mínimo con lo que manda la pantalla.
 */
export interface BloqueParaElegir {
  usadoM3: number;
  aprovechablePct: number;
  porDia: readonly DiaParaElegir[];
  /** Lo repartido al bloque, con sus medidas (ADR-505). Sin esto no se mira medida. */
  asignado?: readonly { medidas: readonly PiezaMedida[] }[];
  bloque?: Pick<BloqueRolliza, "ignorarMedidas"> | null;
}

export interface DiaElegido {
  dia: number;
  /** Aserrada del día. */
  m3: number;
  /** Rolliza que el día necesita para quedar bajo su tope y su aprovechamiento. */
  necesitaM3: number;
  rollizaM3: number;
  trozaIds: string[];
  /** Lo máximo que deja declarar la rolliza asignada (56 %). */
  topeM3: number;
  rendimientoPct: number | null;
  motivo: string | null;
}

export interface SeleccionDeTrozas {
  /** En el orden en que llegaron al patio. */
  elegidas: string[];
  elegidasM3: number;
  objetivoRollizaM3: number;
  /** Lo elegido por encima del objetivo (trozas enteras: la última no se parte). */
  excesoM3: number;
  /** Rolliza que falta en los días abiertos (suma de lo que le falta a cada uno): se dice, no se fuerza. */
  faltaM3: number;
  /** Rolliza de los días que caen en mes cerrado: no se puede consumir, y no es falta de trozas. */
  faltaPorCierreM3: number;
  porDia: DiaElegido[];
  descartadas: { id: string; motivo: string }[];
  /** Medidas que ninguna troza disponible da (no bloquean: el cuadre las mostrará). */
  avisos: string[];
}

const textoLimpio = (v: string | null | undefined) => (v ?? "").trim();

/** Clave de orden: primero la que llegó antes; sin fecha, al final. */
const llegada = (t: TrozaCandidata): number => {
  const ms = t.llegaISO ? Date.parse(t.llegaISO) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

/** Orden determinista: llegada ascendente y, a igual fecha, por id. */
export function ordenarPorLlegada<T extends TrozaCandidata>(trozas: readonly T[]): T[] {
  return [...trozas].sort((a, b) => llegada(a) - llegada(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Las trozas con que el bloque escribe en el Libro: las elegidas si las hay
 * (y sólo las que siguen siendo del bloque), si no todas las suyas. La usan el
 * lote por bloque y las jornadas: `trozasElegidas ?? trozaIds`.
 */
export function trozasDelBloque(b: Pick<BloqueRolliza, "trozaIds" | "trozasElegidas">): string[] {
  const propias = (b.trozaIds ?? []).filter((x) => textoLimpio(x) !== "");
  const elegidas = (b.trozasElegidas ?? []).filter((x) => textoLimpio(x) !== "");
  /* Nunca una elegida fuera de las trozas del bloque: sin trozas, no hay qué elegir. */
  if (elegidas.length === 0 || propias.length === 0) return propias;
  const set = new Set(propias);
  return [...new Set(elegidas.filter((x) => set.has(x)))];
}

/** Rolliza mínima para `m3` de aserrada: máx(m3 ÷ %, m3 ÷ tope). */
export function rollizaNecesariaM3(m3: number, aprovechablePct: number): number {
  if (!(m3 > 0)) return 0;
  const pct = aprovechablePct > 0 ? aprovechablePct : APROVECHABLE_DEFAULT;
  /* Hacia arriba en el 4.º decimal: el tope trunca (`topeDeclarableM3`), así
     lo justo nunca queda una diezmilésima corto. */
  const x = Math.max(m3 / (pct / 100), m3 / (RENDIMIENTO_TOPE_PCT / 100));
  return Math.ceil(x * 10000 - 1e-7) / 10000;
}

/** ¿Esta troza, sola, da la pieza? Sólo cuenta si tiene medidas para juzgarla. */
function daLaPieza(p: PiezaMedida, t: TrozaCandidata): boolean {
  if (!t.medidas) return false;
  const e = elegibilidad(p, [t.medidas], "la troza");
  return e.cabe && e.comprobado;
}

export function elegirTrozasParaBloque(
  bd: BloqueParaElegir | Pick<BloqueDistribuido, "usadoM3" | "aprovechablePct" | "porDia" | "asignado" | "bloque">,
  candidatas: readonly TrozaCandidata[],
): SeleccionDeTrozas {
  const pct = bd.aprovechablePct > 0 ? bd.aprovechablePct : APROVECHABLE_DEFAULT;
  const usado = Math.max(0, Number(bd.usadoM3) || 0);
  const diasIn: DiaParaElegir[] =
    bd.porDia.length > 0 ? bd.porDia.map((d) => ({ dia: d.dia, m3: Math.max(0, Number(d.m3) || 0), cerrado: "cerrado" in d ? d.cerrado : null })) : [{ dia: 1, m3: usado }];

  /* 1 · Quién puede entrar. Una troza repetida en la lista cuenta una vez. */
  const descartadas: { id: string; motivo: string }[] = [];
  const vistas = new Set<string>();
  const libres: TrozaCandidata[] = [];
  for (const t of candidatas) {
    if (!t.id || vistas.has(t.id)) continue;
    vistas.add(t.id);
    const motivo = textoLimpio(t.motivo);
    if (motivo) descartadas.push({ id: t.id, motivo });
    else if (t.porRecepcionar) descartadas.push({ id: t.id, motivo: "no llegó al patio: está por recepcionar" });
    else if (!(Number(t.volumenM3) > 0)) descartadas.push({ id: t.id, motivo: "no tiene volumen registrado" });
    else libres.push(t);
  }
  const orden = ordenarPorLlegada(libres);

  /* 2 · Qué necesita cada día. Un día de mes cerrado no se escribe: su rolliza
     no se puede consumir y se dice aparte (`faltaPorCierreM3`), no como falta
     de trozas. */
  const dias: DiaElegido[] = diasIn.map((d) => ({
    dia: d.dia,
    m3: r4(d.m3),
    necesitaM3: rollizaNecesariaM3(d.m3, pct),
    rollizaM3: 0,
    trozaIds: [],
    topeM3: 0,
    rendimientoPct: null,
    motivo: d.cerrado ? `El día ${d.dia} cae en ${d.cerrado}, mes cerrado del libro: no se puede escribir.` : null,
  }));
  const abiertos = dias.filter((d, i) => !diasIn[i]!.cerrado && d.necesitaM3 > 0);
  const cubrir: DiaPorCubrir[] = abiertos.map((d) => ({ dia: d.dia, necesitaM3: d.necesitaM3 }));
  const objetivoRollizaM3 = r4(abiertos.reduce((a, d) => a + d.necesitaM3, 0));
  const faltaPorCierreM3 = r4(dias.filter((_, i) => diasIn[i]!.cerrado).reduce((a, d) => a + d.necesitaM3, 0));

  /* 3 · Medidas (ADR-505): por cada pieza que no sale de cualquier troza, la
     primera en llegar de las que la dan entra antes que nada. */
  const avisos: string[] = [];
  const elegidasSet = new Set<string>();
  if (!bd.bloque?.ignorarMedidas && abiertos.length > 0) {
    const piezas = (bd.asignado ?? []).flatMap((g) => g.medidas).filter((p) => p.piezas > 0);
    const conMedidas = orden.filter((t) => t.medidas);
    for (const p of conMedidas.length > 0 ? piezas : []) {
      const dan = conMedidas.filter((t) => daLaPieza(p, t));
      if (dan.length === 0) {
        avisos.push(`Ninguna troza disponible da ${p.piezas} pza de ${p.medida}.`);
        continue;
      }
      if (dan.length === conMedidas.length || dan.some((t) => elegidasSet.has(t.id))) continue;
      elegidasSet.add(dan[0]!.id);
    }
  }

  /* 4 · Por orden de llegada hasta cubrir el TOTAL; se reparte (la más grande
     al día que más le falta) y sólo si un día queda corto entra otra troza.
     Así no se elige de más ni se avisa una falta que el total ya cubre. */
  const volDe = (t: TrozaCandidata) => Number(t.volumenM3);
  const resto = orden.filter((t) => !elegidasSet.has(t.id));
  let suma = orden.filter((t) => elegidasSet.has(t.id)).reduce((a, t) => a + volDe(t), 0);
  let i = 0;
  while (abiertos.length > 0 && suma < objetivoRollizaM3 - TOL_M3 && i < resto.length) {
    elegidasSet.add(resto[i]!.id);
    suma += volDe(resto[i++]!);
  }
  const seleccion = () => orden.filter((t) => elegidasSet.has(t.id));
  let reparto = repartirEnDias(seleccion(), cubrir);
  const queda = (d: DiaPorCubrir) => d.necesitaM3 - (reparto.get(d.dia) ?? []).reduce((a, t) => a + volDe(t), 0);
  while (abiertos.length > 0 && cubrir.some((d) => queda(d) > TOL_M3) && i < resto.length) {
    elegidasSet.add(resto[i++]!.id);
    reparto = repartirEnDias(seleccion(), cubrir);
  }

  /* 5 · Cómo queda cada día. La lista sale en orden de llegada. */
  const posicion = new Map(orden.map((t, k) => [t.id, k]));
  const porLlegada = (a: string, b: string) => (posicion.get(a) ?? 0) - (posicion.get(b) ?? 0);
  let faltaM3 = 0;
  for (const d of abiertos) {
    const suyas = reparto.get(d.dia) ?? [];
    d.trozaIds = suyas.map((t) => t.id).sort(porLlegada);
    d.rollizaM3 = r4(suyas.reduce((a, t) => a + volDe(t), 0));
  }
  for (const d of dias) {
    d.topeM3 = topeDeclarableM3(d.rollizaM3);
    d.rendimientoPct = d.rollizaM3 > 0 ? Math.round((d.m3 / d.rollizaM3) * 1000) / 10 : null;
    if (!abiertos.includes(d)) continue;
    const falta = r4(Math.max(0, d.necesitaM3 - d.rollizaM3));
    if (falta <= TOL_M3) continue;
    faltaM3 += falta;
    d.motivo =
      d.rollizaM3 > 0
        ? `Le faltan ${falta.toFixed(3)} m³ de rolliza: con lo elegido el día pasa el ${RENDIMIENTO_TOPE_PCT} % o su aprovechamiento.`
        : `No quedan trozas para este día: le faltan ${falta.toFixed(3)} m³ de rolliza.`;
  }
  const elegidas = [...elegidasSet].filter((id) => abiertos.length > 0 && posicion.has(id)).sort(porLlegada);
  const elegidasM3 = r4(dias.reduce((a, d) => a + d.rollizaM3, 0));
  return {
    elegidas,
    elegidasM3,
    objetivoRollizaM3,
    excesoM3: r4(Math.max(0, elegidasM3 - objetivoRollizaM3)),
    faltaM3: r4(faltaM3),
    faltaPorCierreM3,
    porDia: dias,
    descartadas,
    avisos,
  };
}

/** Un día que recibe trozas: cuánta rolliza necesita. */
export interface DiaPorCubrir {
  dia: number;
  necesitaM3: number;
}

/**
 * Reparte trozas ENTERAS entre los días: la más grande primero, al día al que
 * más le falta (a igual falta, el primero; a igual volumen, por id). Pura y
 * determinista: la usan la propuesta y el plan del Libro, así los dos dicen
 * lo mismo con las mismas trozas (ADR-519).
 */
export function repartirEnDias<T extends { id: string; volumenM3: number }>(
  trozas: readonly T[],
  dias: readonly DiaPorCubrir[],
): Map<number, T[]> {
  const out = new Map<number, T[]>(dias.map((d) => [d.dia, []]));
  if (dias.length === 0) return out;
  const lleva = new Map<number, number>(dias.map((d) => [d.dia, 0]));
  const falta = (d: DiaPorCubrir) => d.necesitaM3 - (lleva.get(d.dia) ?? 0);
  const orden = [...trozas].sort((a, b) => Number(b.volumenM3) - Number(a.volumenM3) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const t of orden) {
    const destino = dias.reduce((mejor, d) => (falta(d) > falta(mejor) + 1e-9 ? d : mejor), dias[0]!);
    out.get(destino.dia)!.push(t);
    lleva.set(destino.dia, r4((lleva.get(destino.dia) ?? 0) + Number(t.volumenM3)));
  }
  return out;
}
