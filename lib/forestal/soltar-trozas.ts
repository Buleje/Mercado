/**
 * SOLTAR trozas de una corrida (ADR-447 §6): las piezas que la persona elige
 * vuelven al patio y la corrida conserva su producción.
 *
 * El caso medido en Blas (28-09): la N° 61 de Cachimbo (27/09) tomó las 12
 * trozas de la especie y cinco corridas del 7 al 21/09 quedaron sin madera; la
 * N° 62 de Panguana, las 7. La única salida era anular la corrida entera, que
 * borra también lo que produjo.
 *
 * Este módulo es PURO: lo usan la vista previa de la pantalla (casillas → antes
 * y después, al instante) y el servidor (`ForestVincularCorridaDB.soltarTrozasEnTx`),
 * que decide con las MISMAS cuentas sobre las filas bloqueadas.
 *
 * ## Las reglas
 *
 *  · El consumo vive en dos lugares y se sueltan los dos: las piezas
 *    (`consumidaEnId`) y el m³ por guía (`ForestCtpConsumo`). Por guía se RESTA
 *    lo de las piezas sueltas, no se recalcula desde cero: una atribución puesta
 *    a mano sobre una guía sin lista de trozas no se pierde.
 *  · La materia prima de la corrida baja lo mismo (`volumeInputM3 − sueltas`) y
 *    el rendimiento se recalcula con la fórmula de siempre (`rendimientoDeCorrida`).
 *  · De la sierra no sale más de lo que entró: si lo que queda no alcanza para
 *    lo producido (10 litros de tolerancia), se rechaza. Es la misma regla con
 *    la que se vinculó (`vincularCorridaEnTx`), al revés.
 *  · El 56 % AVISA, no rechaza. El techo es de DECLARACIÓN (ADR-358: frena al
 *    que declara producto de más). Soltar no declara producto: dice qué madera
 *    no entró. Rechazarlo obligaría a dejar atribuidas trozas que no entraron
 *    para esconder un rendimiento alto — fabricar la atribución que el `≤`
 *    prohíbe. Se guarda el rendimiento REAL, se avisa y queda en el rastro con
 *    el motivo, igual que al vincular.
 *  · Soltarlas TODAS vale: la corrida vuelve a «sin origen» con su producción
 *    intacta. Faltante = sin atribuir, nunca un origen inventado.
 */
import { z } from "zod";
import { formatNumber } from "@/lib/format";
import { motivoSchema } from "./motivo";
import { pasaElTope, rendimientoDeCorrida, TOPE_RENDIMIENTO_PCT } from "./vincular-produccion";
import type { DiagnosticoSinOrigen } from "./vincular-trozas";
import type { PropuestaDeTandaOrigen } from "./origen-en-tanda";

/** Redondeo a 4 decimales — precisión forestal (m³). */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
/** Diez litros: la tolerancia del patio, no la del float (regla verificacion-de-verdad §4). */
export const TOL_SOLTAR_M3 = 0.01;
/** Un motivo que se lee: «error» no le dice nada a un fiscalizador. */
export const MOTIVO_MIN_SOLTAR = 5;
export const MENSAJE_MOTIVO_SOLTAR = "Escribe por qué vuelven al patio: queda en el rastro de la corrida.";
/** Piezas por pedido: una corrida real tiene decenas, no cientos. */
export const MAX_TROZAS_SOLTAR = 300;
/** Piezas que la simulación acepta por la URL (≈ 26 caracteres cada id). */
export const MAX_TROZAS_SIMULAR = 150;

export { TOPE_RENDIMIENTO_PCT };

const idCorto = z.string().trim().min(1).max(40);

/** `POST { accion: "soltar", corridaId, trozaIds, motivo }`. */
export const soltarTrozasSchema = z.object({
  accion: z.literal("soltar"),
  corridaId: idCorto,
  trozaIds: z
    .array(idCorto)
    .min(1, "Elige al menos una troza para soltar.")
    .max(MAX_TROZAS_SOLTAR, `Se sueltan hasta ${MAX_TROZAS_SOLTAR} trozas por vez.`)
    .refine((ids) => new Set(ids).size === ids.length, "Una troza aparece dos veces."),
  /* Sin invisibles y con 3 letras al menos (`motivo.ts`): un «motivo» de
     espacios de ancho cero pasaba el `trim().min()`. */
  motivo: motivoSchema({
    min: MOTIVO_MIN_SOLTAR,
    max: 300,
    mensaje: MENSAJE_MOTIVO_SOLTAR,
    mensajeMax: "El motivo va en una o dos frases (hasta 300 letras).",
  }),
});
export type SoltarTrozasPedido = z.infer<typeof soltarTrozasSchema>;

// ── Lo que se lee de la corrida ─────────────────────────────────────────────

/** El lote donde está la pieza, como lo necesita la decisión. */
export interface LoteDeLaPieza {
  id: string;
  code: string;
  status: string;
  /** El lote lo cerró ESTA corrida (`produccionEntryId`): es el casillero (10) de su renglón. */
  deEstaCorrida: boolean;
  /** Borrado: la pieza sale de él pase lo que pase. */
  borrado: boolean;
}

/** Una pieza que entró a la corrida. */
export interface PiezaDeLaCorrida {
  id: string;
  woodEntryId: string;
  gtfNumber: string;
  /** Código de planta o del bosque; `null` si no tiene. */
  codigo: string | null;
  especie: string | null;
  m3: number;
  /** AAAA-MM-DD del día que entró a la sierra; `null` si no se anotó. */
  fechaConsumo: string | null;
  lote: LoteDeLaPieza | null;
}

/** El m³ atribuido a una guía (`ForestCtpConsumo`). */
export interface ConsumoDeLaCorrida {
  woodEntryId: string;
  gtfNumber: string;
  m3: number;
}

/** La corrida, en lo que decide si se puede soltar. */
export interface CorridaParaSoltar {
  id: string;
  lineNo: number;
  /** AAAA-MM-DD. */
  fecha: string;
  especie: string | null;
  /** Lo producido; `null` = la corrida todavía no lo declara (abierta). */
  producido: number | null;
  unit: string | null;
  /** La materia prima que declara (`volumeInputM3`); `null` = no la declara. */
  volumenEntradaM3: number | null;
  rendimientoPct: number | null;
  /** Algún consumo tiene el costo congelado: la atribución es inmutable. */
  congelado: boolean;
  /** Nombre del período cerrado donde cae, o `null`. */
  mesCerrado: string | null;
}

// ── La vista previa (y la decisión del servidor) ────────────────────────────

/** Qué pasa con un lote que tiene piezas sueltas. */
export type DestinoDelLote =
  /** Estaba abierto: las piezas siguen en él, libres para la próxima corrida. */
  | "queda"
  /**
   * Lo cerró esta corrida y ya no le queda ninguna pieza de ella: vuelve a
   * abrirse con sus trozas (y deja de ser el lote de esta corrida).
   */
  | "reabrir"
  /**
   * La corrida sigue consumiendo del lote (o es de otra corrida): el lote queda
   * como está y las piezas SALEN de él, sueltas al patio. Así el casillero (10)
   * de la corrida sigue diciendo su lote y la pieza no queda «en un lote
   * consumido», que la sierra no puede tomar.
   */
  | "suelta";

export interface LoteDeLaVista {
  loteId: string;
  code: string;
  destino: DestinoDelLote;
  /** Piezas sueltas de este lote. */
  piezas: number;
  /** Piezas que la corrida sigue consumiendo de este lote. */
  quedan: number;
}

export interface LadoDeLaVista {
  piezas: number;
  /** Materia prima declarada; `null` = sin origen. */
  m3: number | null;
  rendimientoPct: number | null;
}

export interface VistaPreviaDeSoltar {
  antes: LadoDeLaVista;
  despues: LadoDeLaVista;
  sueltas: { piezas: number; m3: number };
  porGuia: { woodEntryId: string; gtfNumber: string; antes: number; despues: number }[];
  /** Lo que se escribe en `ForestCtpConsumo`: sólo las guías que siguen con m³. */
  consumosNuevos: { woodEntryId: string; volumeM3: number }[];
  lotes: LoteDeLaVista[];
  /** No queda ni pieza ni m³: la corrida vuelve a «sin origen» con su producción. */
  quedaSinOrigen: boolean;
  /** Lo que queda no alcanza para lo producido: se rechaza. */
  imposible: boolean;
  /** El después pasa el 56 % de la plaza: se avisa, se guarda igual. */
  sobreElTope: boolean;
  /** Las guías quedarían con más m³ que la materia prima (atribución puesta a mano): se rechaza. */
  sobreAtribuido: boolean;
}

/** El destino de un lote con piezas sueltas (ver `DestinoDelLote`). */
export function destinoDelLote(lote: LoteDeLaPieza, quedanDeEsta: number): DestinoDelLote {
  if (lote.borrado) return "suelta";
  if (lote.status === "abierto") return "queda";
  /* Sólo `consumido`: uno `cerrado` ya se dio por terminado y `reabrir()` lo
     niega; su madera sale suelta, como la que libera `cerrar()`. */
  if (lote.status === "consumido" && lote.deEstaCorrida && quedanDeEsta === 0) return "reabrir";
  return "suelta";
}

/** La frase del aviso tras soltar: qué volvió al patio y cómo quedó la corrida. */
export function fraseDeSoltar(r: Extract<ResultadoSoltarTrozas, { ok: true }>): string {
  const n = r.piezas === 1 ? "1 troza" : `${r.piezas} trozas`;
  /* `lib/format`, el formato único del panel: la frase tiene que decir el
     mismo número que la tabla de al lado. */
  const cola = r.quedaSinOrigen
    ? " La corrida quedó sin origen, con lo producido intacto."
    : r.despues.rendimientoPct != null
      ? ` Ahora rinde ${formatNumber(r.despues.rendimientoPct, 1)} %${r.sobreElTope ? `, más que el ${TOPE_RENDIMIENTO_PCT} % de la plaza` : ""}.`
      : "";
  return `La N.º ${r.lineNo} devolvió ${n} al patio (${formatNumber(r.m3, 3)} m³).${cola}`;
}

/**
 * Antes y después de soltar esas piezas. `sueltas` son ids de piezas de la
 * corrida; los que no son de ella se ignoran (el servidor los rechaza antes).
 */
export function vistaPreviaDeSoltar(
  corrida: Pick<CorridaParaSoltar, "producido" | "unit" | "volumenEntradaM3">,
  piezas: readonly PiezaDeLaCorrida[],
  consumos: readonly ConsumoDeLaCorrida[],
  sueltas: Iterable<string>,
): VistaPreviaDeSoltar {
  const ids = new Set(sueltas);
  const salen = piezas.filter((p) => ids.has(p.id));
  const quedan = piezas.filter((p) => !ids.has(p.id));
  const suma = (xs: readonly PiezaDeLaCorrida[]) => r4(xs.reduce((a, p) => a + (Number(p.m3) || 0), 0));
  const delta = suma(salen);

  /* Sin volumen escrito (corrida vieja que sólo tiene piezas), la materia prima
     son sus piezas: es el mismo número que el vinculador habría escrito. */
  const volumenAntes = corrida.volumenEntradaM3 != null ? r4(corrida.volumenEntradaM3) : piezas.length > 0 ? suma(piezas) : null;
  const restoCrudo = volumenAntes == null ? null : r4(volumenAntes - delta);
  const volumenResto = restoCrudo == null ? null : restoCrudo <= TOL_SOLTAR_M3 ? 0 : restoCrudo;

  /* Por guía: se RESTA lo de las piezas sueltas, nunca por debajo de 0. */
  const antesPorGuia = new Map(consumos.map((c) => [c.woodEntryId, r4(c.m3)]));
  const nombre = new Map<string, string>(consumos.map((c) => [c.woodEntryId, c.gtfNumber]));
  const salePorGuia = new Map<string, number>();
  for (const p of salen) {
    salePorGuia.set(p.woodEntryId, r4((salePorGuia.get(p.woodEntryId) ?? 0) + (Number(p.m3) || 0)));
    if (!nombre.has(p.woodEntryId)) nombre.set(p.woodEntryId, p.gtfNumber);
  }
  const guias = [...new Set([...antesPorGuia.keys(), ...salePorGuia.keys()])];
  const restado = guias
    .map((woodEntryId) => {
      const antes = antesPorGuia.get(woodEntryId) ?? 0;
      const despues = r4(Math.max(0, antes - (salePorGuia.get(woodEntryId) ?? 0)));
      return { woodEntryId, gtfNumber: nombre.get(woodEntryId) ?? "", antes, despues: despues < 0.0001 ? 0 : despues };
    })
    .sort((a, b) => a.gtfNumber.localeCompare(b.gtfNumber, "es-PE", { numeric: true }));
  const atribuidoDespues = r4(restado.reduce((a, g) => a + g.despues, 0));

  const quedaSinOrigen = quedan.length === 0 && (volumenResto ?? 0) === 0 && atribuidoDespues <= TOL_SOLTAR_M3;
  const m3Despues = quedaSinOrigen ? null : volumenResto;
  /* Sin origen, ninguna guía conserva m³: el resto bajo la tolerancia (redondeo
     de la guía contra sus piezas) se grababa como un consumo de 0,005 m³ con la
     materia prima en null. */
  const porGuia = quedaSinOrigen ? restado.map((g) => ({ ...g, despues: 0 })) : restado;
  const consumosNuevos = porGuia.filter((g) => g.despues > 0).map((g) => ({ woodEntryId: g.woodEntryId, volumeM3: g.despues }));

  const producido = corrida.producido == null ? null : Number(corrida.producido);
  const enM3 = (corrida.unit ?? "m3") === "m3";
  const imposible = !quedaSinOrigen && producido != null && producido > 0 && enM3 && producido > (m3Despues ?? 0) + TOL_SOLTAR_M3;
  const rendimientoDespues = m3Despues == null ? null : rendimientoDeCorrida(producido, m3Despues, corrida.unit);

  /* Los lotes: cuántas piezas de ESTA corrida quedan en cada uno decide si se reabre. */
  const quedanPorLote = new Map<string, number>();
  for (const p of quedan) if (p.lote) quedanPorLote.set(p.lote.id, (quedanPorLote.get(p.lote.id) ?? 0) + 1);
  const lotes = new Map<string, LoteDeLaVista>();
  for (const p of salen) {
    if (!p.lote) continue;
    const previo = lotes.get(p.lote.id);
    if (previo) {
      previo.piezas += 1;
      continue;
    }
    const q = quedanPorLote.get(p.lote.id) ?? 0;
    lotes.set(p.lote.id, { loteId: p.lote.id, code: p.lote.code, destino: destinoDelLote(p.lote, q), piezas: 1, quedan: q });
  }

  return {
    antes: {
      piezas: piezas.length,
      m3: volumenAntes,
      rendimientoPct: volumenAntes == null ? null : rendimientoDeCorrida(producido, volumenAntes, corrida.unit),
    },
    despues: { piezas: quedan.length, m3: m3Despues, rendimientoPct: rendimientoDespues },
    sueltas: { piezas: salen.length, m3: delta },
    porGuia,
    consumosNuevos,
    lotes: [...lotes.values()].sort((a, b) => a.code.localeCompare(b.code, "es-PE", { numeric: true })),
    quedaSinOrigen,
    imposible,
    sobreElTope: !imposible && pasaElTope(rendimientoDespues),
    sobreAtribuido: !quedaSinOrigen && atribuidoDespues > (m3Despues ?? 0) + 0.0001,
  };
}

// ── El contrato con la pantalla ─────────────────────────────────────────────

/** `GET ?soltar=<corridaId>`: la corrida con sus piezas y sus m³ por guía. */
export interface VistaDeSoltar {
  corrida: CorridaParaSoltar;
  piezas: PiezaDeLaCorrida[];
  consumos: ConsumoDeLaCorrida[];
}

/** Una corrida sin origen, en lo que la pantalla nombra. */
export interface CorridaQueEspera {
  corridaId: string;
  lineNo: number | null;
  /** AAAA-MM-DD. */
  fecha: string;
  especie: string;
  m3Producido: number;
}

/** Qué destraba soltar esas piezas, medido con el diagnóstico del servidor (sólo lee). */
export interface QueDestraba {
  /** Listas para vincular de a una, antes y después. */
  listasAntes: number;
  listasDespues: number;
  /** Las que entran juntas en la tanda (ninguna troza en dos corridas). */
  enTandaAntes: number;
  enTandaDespues: number;
  /** Las que pasan a estar listas con esto, la más vieja primero. */
  nuevas: CorridaQueEspera[];
  /** Las que esperaban la madera de esta corrida y siguen sin poder vincularse, con la frase de por qué. */
  siguen: (CorridaQueEspera & { detalle: string })[];
  /**
   * Si ADEMÁS se corrige la llegada de estas guías a la fecha de su guía
   * (ADR-434, el mismo escenario de `simularArreglos`), las que entrarían en la
   * tanda. `null` = corregir la llegada no suma ninguna. Es un segundo paso con
   * su propio motivo: si la madera de verdad llegó después, esas corridas NO
   * salieron de ella.
   */
  conLlegada: { guias: string[]; enTanda: CorridaQueEspera[] } | null;
}

/** `GET ?soltar=<id>&simular=1[&trozas=a,b]`. */
export interface SimulacionDeSoltar {
  /**
   * Las piezas que la tanda les daría HOY a las corridas que esperan, si toda
   * la madera de esta corrida estuviera en el patio: la sugerencia de «Marcar
   * las que necesitan». Nunca se aplica sola.
   */
  sugeridas: string[];
  /**
   * Lo mismo si además se corrige la llegada de `guiasALlegar` (las guías de
   * esta madera). Vacío si la llegada no suma nada. Las dos sugerencias dejan
   * a la corrida que suelta con su producción cubierta (`sugerenciaQueCabe`).
   */
  sugeridasConLlegada: string[];
  guiasALlegar: string[];
  /** Con la selección pedida; `null` si no se pidió ninguna. */
  destraba: QueDestraba | null;
}

export type ResultadoSoltarTrozas =
  | {
      ok: true;
      corridaId: string;
      lineNo: number;
      piezas: number;
      m3: number;
      antes: LadoDeLaVista;
      despues: LadoDeLaVista;
      sobreElTope: boolean;
      quedaSinOrigen: boolean;
      lotes: LoteDeLaVista[];
      consumos: { woodEntryId: string; gtfNumber: string; volumenM3: number }[];
    }
  | { ok: false; error: string; message: string };

// ── Qué destraba: comparar dos diagnósticos (puro) ──────────────────────────

const esperaDe = (c: DiagnosticoSinOrigen["corridas"][number]): CorridaQueEspera => ({
  corridaId: c.corridaId,
  lineNo: c.lineNo,
  fecha: c.fecha,
  especie: c.especie,
  m3Producido: c.m3Producido,
});

const porFecha = (a: CorridaQueEspera, b: CorridaQueEspera) =>
  a.fecha.localeCompare(b.fecha) || (a.lineNo ?? 0) - (b.lineNo ?? 0);

/**
 * Antes contra después, con el MISMO diagnóstico que la bandeja: cuántas quedan
 * listas, cuántas entran en tanda, cuáles pasan a estar listas y cuáles de las
 * que esperaban a `corridaId` siguen trabadas (y por qué).
 */
export function queDestraba(
  corridaId: string,
  antes: { diag: DiagnosticoSinOrigen; tanda: PropuestaDeTandaOrigen },
  despues: { diag: DiagnosticoSinOrigen; tanda: PropuestaDeTandaOrigen },
  /** La tanda del «después» con las llegadas corregidas (`conLlegadasCorregidas`). */
  trasLlegada?: { guias: string[]; tanda: PropuestaDeTandaOrigen },
): QueDestraba {
  const lista = (c: DiagnosticoSinOrigen["corridas"][number]) => c.motivo === "lista" && !c.mesCerrado;
  const antesListas = new Set(antes.diag.corridas.filter(lista).map((c) => c.corridaId));
  const esperaban = new Set(
    antes.diag.corridas
      .filter((c) => c.arreglo.tipo === "soltar_corrida" && c.arreglo.corridas.some((t) => t.corridaId === corridaId))
      .map((c) => c.corridaId),
  );
  const nuevas = despues.diag.corridas
    .filter((c) => lista(c) && !antesListas.has(c.corridaId) && c.corridaId !== corridaId)
    .map(esperaDe)
    .sort(porFecha);
  const siguen = despues.diag.corridas
    .filter((c) => esperaban.has(c.corridaId) && !lista(c))
    .map((c) => ({ ...esperaDe(c), detalle: c.detalle }))
    .sort(porFecha);
  /* Sólo las que esperaban ESTA madera: corregir la llegada también destraba
     corridas de otras especies, y eso ya lo dice su propia línea de la bandeja. */
  const enTandaTrasLlegada = (trasLlegada?.tanda.grupos ?? [])
    .flatMap((g) => g.corridas)
    .filter((c) => c.corridaId !== corridaId && esperaban.has(c.corridaId))
    .map((c) => ({ corridaId: c.corridaId, lineNo: c.lineNo, fecha: c.fecha, especie: c.especie, m3Producido: c.m3Producido }))
    .sort(porFecha);
  const yaEnTanda = new Set(despues.tanda.grupos.flatMap((g) => g.corridas.map((c) => c.corridaId)));
  const suma = trasLlegada && trasLlegada.guias.length > 0 && enTandaTrasLlegada.some((c) => !yaEnTanda.has(c.corridaId));
  return {
    listasAntes: antes.tanda.listas,
    listasDespues: despues.tanda.listas,
    enTandaAntes: antes.tanda.vinculables,
    enTandaDespues: despues.tanda.vinculables,
    nuevas,
    siguen,
    conLlegada: trasLlegada && suma ? { guias: trasLlegada.guias, enTanda: enTandaTrasLlegada } : null,
  };
}

/**
 * Las piezas de `corridaId` que la tanda del «después» le da a cada OTRA
 * corrida, en el orden de la tanda (la más vieja primero): con toda su madera
 * en el patio, esto es lo que las que esperan tomarían.
 */
export function piezasQueTomaLaTanda(
  tanda: PropuestaDeTandaOrigen,
  corridaId: string,
  deLaCorrida: ReadonlySet<string>,
): { corridaId: string; trozaIds: string[] }[] {
  const vistas = new Set<string>();
  const out: { corridaId: string; trozaIds: string[] }[] = [];
  for (const g of tanda.grupos) {
    for (const c of g.corridas) {
      if (c.corridaId === corridaId) continue;
      const suyas = c.trozas.map((t) => t.trozaId).filter((id) => deLaCorrida.has(id) && !vistas.has(id));
      for (const id of suyas) vistas.add(id);
      if (suyas.length > 0) out.push({ corridaId: c.corridaId, trozaIds: suyas });
    }
  }
  return out;
}

/**
 * La sugerencia que se puede firmar: corrida por corrida (en el orden de la
 * tanda) se suman sus piezas mientras la corrida que suelta siga cubriendo lo
 * que produjo. La que no cabe entera se salta: media madera no la destraba y
 * sólo subiría el rendimiento de la otra. Nunca deja a la que suelta sin origen.
 */
export function sugerenciaQueCabe(
  corrida: Pick<CorridaParaSoltar, "producido" | "unit" | "volumenEntradaM3">,
  piezas: readonly PiezaDeLaCorrida[],
  consumos: readonly ConsumoDeLaCorrida[],
  porCorrida: readonly { corridaId: string; trozaIds: readonly string[] }[],
): string[] {
  let elegidas: string[] = [];
  for (const g of porCorrida) {
    const prueba = [...elegidas, ...g.trozaIds];
    const v = vistaPreviaDeSoltar(corrida, piezas, consumos, prueba);
    if (v.imposible || v.sobreAtribuido || v.quedaSinOrigen) continue;
    elegidas = prueba;
  }
  return elegidas;
}
