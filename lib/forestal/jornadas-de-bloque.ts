/**
 * jornadas-de-bloque — de la Distribución de rolliza al Libro, jornada por
 * jornada (ADR-464, fases 3 y 4).
 *
 * Decisiones de Brandon (2026-10-03):
 *  · **Cada jornada del bloque es una producción** (una corrida del Libro), con
 *    las trozas REALES del bloque (`trozaIds`) consumidas desde su lote
 *    (`loteId`). Un bloque a mano no escribe: no sabe de qué piezas sale (T1).
 *  · **Completar un lote ya aserrado** tiene dos líneas, a elección: LPC
 *    (complemento de la principal, bajo el tope del 56 %) o LRE (reproceso de
 *    lo que el lote ya produjo).
 *
 * Una troza **no se parte entre dos días** (T1, ADR-373): el día reparte
 * trozas enteras, no pedazos. Se reparten en proporción a lo aserrado de cada
 * día, la más grande primero al día que más le falta: así cada jornada rinde
 * parecido y ninguna pasa el tope por haberse quedado con la troza chica.
 *
 * Todo lo que no se puede atribuir (trozas que ya no están libres en el lote)
 * se dice y queda `sinAtribuirM3`: nunca se reparte la producción sobre menos
 * madera de la que la sostiene (I1/I2: `≤`).
 *
 * La verdad es el Libro: un día marcado como escrito cuya corrida ya no está
 * viva (se anuló) vuelve a poder registrarse.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`. La fecha de hoy entra
 * por parámetro (`limaDateKey()` en la pantalla).
 */
import { juntarGrupos, sumarDias, type Jornada } from "./consumo-en-jornadas";
import {
  esAserradaDirecta,
  type AsignacionGrupo,
  type BloqueDistribuido,
  type BloqueRolliza,
} from "./cubicacion-reparto";
import { fmtM3 } from "./cubicacion-formato";
import type { LoteAserrio, TrozaDelLote } from "./lotes-aserrio";
import { TEXTO_ESTADO_LOCAL } from "./lotes-por-bloque";
import { corridasAMedioDeclarar, RENDIMIENTO_TOPE_PCT, topeDeclarableM3, type CorridaAMedioDeclarar } from "./produccion-paquetes";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
/** Un litro: la tolerancia con la que el servidor compara contra el tope. */
const TOL_TOPE_M3 = 0.001;
/** La unidad de la GTF (3 decimales): debajo de eso, «sin atribuir» es redondeo. */
const TOL_GTF_M3 = 0.0005;

/** Lo que hace falta del lote: sus piezas y sus corridas vivas. */
export type LoteParaLibro = Pick<LoteAserrio, "id" | "code" | "trozas" | "corridas" | "volumenM3">;

export type EstadoJornadaLibro = "en-libro" | "abierta" | "lista" | "apagada" | "sin-produccion";

export interface JornadaDelBloque extends Jornada {
  /** Día que todavía no pasó y sin escribir: se registrará más adelante, así que «Completar» no se ofrece por él. */
  enEspera?: boolean;
  /** Apagada sólo porque un día anterior falta (el Libro se llena en orden): su motivo propio se ve recién cuando el anterior entra. */
  porOrden?: boolean;
  estado: EstadoJornadaLibro;
  /** Por qué no se puede registrar (o qué falta en una corrida abierta). */
  motivo: string | null;
  /** Algo que conviene saber pero no impide registrar. */
  aviso: string | null;
  corridaId: string | null;
  lineNo: number | null;
  /** Aserrada ÷ rolliza del día, en %; `null` sin rolliza asignada. */
  rendimientoPct: number | null;
}

export interface PlanLibroDeBloque {
  /** Madera ya aserrada: no pasa por la sierra, no se dibuja botón. */
  oculto: boolean;
  /** El bloque entero no escribe, y por qué. */
  motivo: string | null;
  jornadas: JornadaDelBloque[];
  /** Trozas del bloque que ya no están libres en su lote (ni entraron por acá). */
  noDisponibles: number;
  /** Rolliza del bloque (m³) que no se puede atribuir: se dice, no se fuerza. */
  sinAtribuirM3: number;
}

const fechaValida = (f: string | null | undefined): f is string => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f);

/** `AAAA-MM-DD` → `dd/mm/aaaa`, sin `Date` (date-only: nada de zona horaria). */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

const vol = (t: Pick<TrozaDelLote, "volumenM3">) => Number(t.volumenM3) || 0;
const rotulo = (t: Pick<TrozaDelLote, "id" | "codigoPlanta" | "codificacion">) => t.codigoPlanta || t.codificacion || t.id;

/**
 * Las líneas («Por tipo») que ya salieron con «Completar». Un complemento cuya
 * corrida ya no está viva en el Libro no cuenta: si se anuló, la línea vuelve
 * a estar pendiente (sin esto el bloque quedaba trabado para siempre). Sin la
 * lista de vivas, o sin corrida anotada (reprocesos viejos), cuenta — el lado
 * seguro es no declarar dos veces.
 */
export function clavesCompletadas(
  b: Pick<BloqueDistribuido["bloque"], "complementos">,
  vivas: ReadonlySet<string> | null,
): Set<string> {
  return new Set(
    (b.complementos ?? [])
      .filter((c) => !vivas || !c.corridaId || vivas.has(c.corridaId))
      .flatMap((c) => c.claves),
  );
}

/** El bloque no escribe en el Libro: por qué (o `null` si puede). */
export function motivoDelBloque(
  b: Pick<BloqueRolliza, "trozaIds" | "loteId" | "origen">,
  lote: LoteParaLibro | null | undefined,
): string | null {
  if (!b.trozaIds || b.trozaIds.length === 0) {
    return b.origen === "lote"
      ? "Salió de un lote ya creado, sin sus trozas: su producción se registra desde Consumos del Libro."
      : `${TEXTO_ESTADO_LOCAL.manual}.`;
  }
  if (!b.loteId) return "Crea su lote primero (botón «Crear lotes»): la jornada consume sus trozas desde ese lote.";
  if (!lote) return "No encuentro su lote en el Libro: recarga la página o vuelve a crearlo.";
  return null;
}

export function planLibroDeBloque(
  bd: Pick<BloqueDistribuido, "bloque" | "porDia">,
  lote: LoteParaLibro | null | undefined,
  hoy: string,
): PlanLibroDeBloque {
  const b = bd.bloque;
  if (esAserradaDirecta(b)) {
    return { oculto: true, motivo: "Madera ya aserrada: no pasa por la sierra.", jornadas: [], noDisponibles: 0, sinAtribuirM3: 0 };
  }
  const inicio = fechaValida(b.fecha) ? b.fecha : hoy;
  /* Los totales del día salen de SUS grupos: son los paquetes que se declaran,
     y el servidor exige que sumen lo declarado (a un litro). */
  const jornadas: JornadaDelBloque[] = bd.porDia.map((d) => ({
    dia: d.dia,
    fecha: sumarDias(inicio, d.dia - 1),
    trozaIds: [],
    etiquetas: [],
    rollizaM3: 0,
    grupos: d.grupos,
    piezas: d.grupos.reduce((a, g) => a + g.piezas, 0),
    pieTablar: Math.round(d.grupos.reduce((a, g) => a + g.pieTablar, 0) * 100) / 100,
    m3: r4(d.grupos.reduce((a, g) => a + g.m3, 0)),
    estado: d.piezas > 0 && d.grupos.length > 0 ? "lista" : "sin-produccion",
    motivo: null,
    aviso: null,
    corridaId: null,
    lineNo: null,
    rendimientoPct: null,
  }));

  /* 1 · Lo ya escrito. Con el lote a la vista manda el Libro: si la corrida
     ya no está viva, la madera volvió al patio y el día se puede rehacer. */
  const vivas = lote?.corridas ? new Map(lote.corridas.filter((c) => c.viva).map((c) => [c.id, c])) : null;
  const nuestras = new Set<string>();
  for (const reg of b.jornadasLibro ?? []) {
    const j = jornadas.find((x) => x.dia === reg.dia);
    if (!j) continue;
    const viva = vivas?.get(reg.corridaId);
    if (vivas && !viva) {
      j.aviso = `La corrida N° ${reg.lineNo} ya no está viva en el Libro (se anuló): este día se puede registrar de nuevo.`;
      continue;
    }
    nuestras.add(reg.corridaId);
    const abierta = viva ? viva.quantity == null : reg.estado === "abierta";
    j.estado = abierta ? "abierta" : "en-libro";
    j.corridaId = reg.corridaId;
    j.lineNo = viva?.lineNo ?? reg.lineNo;
    j.fecha = reg.fecha;
    j.motivo = abierta
      ? `Consumió sus trozas y falta declarar lo que salió: declárale la producción a la corrida N° ${j.lineNo} desde la tabla del Libro.`
      : null;
  }

  /* 2 · Una línea que ya salió con «Completar» no se declara otra vez — si su
     corrida sigue viva: anulada, la línea vuelve a estar pendiente. */
  const completadas = clavesCompletadas(b, vivas ? new Set(vivas.keys()) : null);
  for (const c of b.complementos ?? []) if (c.corridaId && (!vivas || vivas.has(c.corridaId))) nuestras.add(c.corridaId);
  for (const j of jornadas) {
    if (j.estado !== "lista") continue;
    const ya = j.grupos.find((g) => completadas.has(g.clave));
    if (ya) {
      j.estado = "apagada";
      j.motivo = `«${ya.label}» ya se declaró con «Completar»: este día ya no se registra entero.`;
    }
  }

  const motivo = motivoDelBloque(b, lote);
  if (motivo || !lote) {
    for (const j of jornadas) {
      if (j.estado === "lista") {
        j.estado = "apagada";
        j.motivo = motivo;
      }
    }
    return { oculto: false, motivo, jornadas, noDisponibles: 0, sinAtribuirM3: 0 };
  }

  /* 3 · Las trozas del bloque que siguen libres EN SU LOTE. Lo que el Libro
     dice manda sobre la lista guardada: una pieza consumida por otra corrida
     ya no es de este bloque, y una que no está en el lote no se mete. */
  const ids = new Set(b.trozaIds ?? []);
  const delBloque = lote.trozas.filter((t) => ids.has(t.id));
  const libres = delBloque
    .filter((t) => !t.consumidaEnId && vol(t) > 0)
    .sort((x, y) => vol(y) - vol(x) || x.id.localeCompare(y.id));
  const porAca = delBloque.filter((t) => t.consumidaEnId && nuestras.has(t.consumidaEnId));
  /* Una pieza del bloque que se comió una corrida que NO salió de acá: puede
     ser esta misma jornada registrada desde otro dispositivo (la marca vive en
     cada uno). Repartir lo que queda entre los días haría declarar dos veces
     lo mismo, así que se para y se dice cuál corrida fue. */
  const ajenas = [...new Set(delBloque.map((t) => t.consumidaEnId).filter((c): c is string => Boolean(c) && !nuestras.has(c!)))];
  const noDisponibles = Math.max(0, ids.size - libres.length - porAca.length);
  const atribuible = [...libres, ...porAca].reduce((a, t) => a + vol(t), 0);
  const faltante = r4(Math.max(0, (Number(b.m3) || 0) - atribuible));
  const sinAtribuirM3 = noDisponibles > 0 && faltante > TOL_GTF_M3 ? faltante : 0;

  /* 4 · Trozas enteras a cada día pendiente, en proporción a lo aserrado. */
  const pendientes = jornadas.filter((j) => j.estado === "lista");
  if (pendientes.length > 0 && ajenas.length > 0) {
    /* `n > 0`: la corrida simulada de la tanda lleva N° 0 y no se nombra. */
    const nros = ajenas.map((c) => vivas?.get(c)?.lineNo).filter((n): n is number => n != null && n > 0);
    const cual = nros.length > 0 ? `la corrida N° ${nros.join(", ")}` : "otra corrida";
    for (const j of pendientes) {
      j.estado = "apagada";
      j.motivo =
        `Trozas del bloque ya entraron a la sierra por ${cual}, que no se registró desde esta distribución. ` +
        "Revisa el Libro: si es una de estas jornadas, no la registres de nuevo; lo que falte se declara con «Completar».";
    }
  } else if (pendientes.length > 0 && libres.length === 0) {
    const porque =
      delBloque.length === 0
        ? `Sus trozas ya no están en el lote ${lote.code}: vuelve a crear el lote del bloque.`
        : /* Sin ajenas (esa rama va antes): se las llevaron los días ya registrados desde acá. */
          "Las trozas del bloque ya entraron en los días registrados: a este día no le queda madera propia (una troza no se parte entre dos corridas). Lo que falta se declara con «Completar».";
    for (const j of pendientes) {
      j.estado = "apagada";
      j.motivo = porque;
    }
  } else if (pendientes.length > 0) {
    const totalM3 = pendientes.reduce((a, j) => a + j.m3, 0);
    const totalVol = libres.reduce((a, t) => a + vol(t), 0);
    const orden = [...pendientes].sort((x, y) => y.m3 - x.m3 || x.dia - y.dia);
    const meta = new Map(orden.map((j) => [j.dia, totalM3 > 0 ? (totalVol * j.m3) / totalM3 : totalVol / orden.length]));
    const deficit = (j: JornadaDelBloque) => (meta.get(j.dia) ?? 0) - j.rollizaM3;
    libres.forEach((t, i) => {
      /* Primero una troza a cada día (la más grande al que más aserró), y el
         resto al que más lejos está de su parte. */
      const destino =
        i < orden.length ? orden[i]! : orden.reduce((mejor, j) => (deficit(j) > deficit(mejor) + 1e-9 ? j : mejor), orden[0]!);
      destino.trozaIds.push(t.id);
      destino.etiquetas.push(rotulo(t));
      destino.rollizaM3 = r4(destino.rollizaM3 + vol(t));
    });
  }

  /* 5 · Qué día se puede registrar ahora. El Libro se llena en orden: un día
     no entra antes que el anterior. */
  let anterior: number | null = null;
  for (const j of jornadas) {
    if (j.estado === "lista" || j.estado === "apagada") {
      j.rendimientoPct = j.rollizaM3 > 0 ? Math.round((j.m3 / j.rollizaM3) * 1000) / 10 : null;
    }
    if (j.estado !== "lista") {
      if (j.estado === "apagada") anterior ??= j.dia;
      continue;
    }
    const tope = topeDeclarableM3(j.rollizaM3);
    if (j.trozaIds.length === 0) {
      j.estado = "apagada";
      j.motivo =
        `Quedan ${libres.length} troza${libres.length === 1 ? "" : "s"} libre${libres.length === 1 ? "" : "s"} para ` +
        `${pendientes.length} días: una troza no se parte entre dos corridas (T1). Baja los días del bloque.`;
    } else if (anterior != null) {
      j.estado = "apagada";
      j.porOrden = true;
      j.motivo = `Registra primero el día ${anterior}: el Libro se llena en orden.`;
    } else if (j.fecha > hoy) {
      j.estado = "apagada";
      j.motivo = `Cae el ${fechaCorta(j.fecha)} y hoy es ${fechaCorta(hoy)}: el Libro no registra un día que no pasó. Corrige la fecha del bloque.`;
    } else if (j.m3 > tope + TOL_TOPE_M3) {
      j.estado = "apagada";
      j.motivo =
        `Con ${j.trozaIds.length} troza${j.trozaIds.length === 1 ? "" : "s"} (${fmtM3(j.rollizaM3)} m³) el tope del ` +
        `${RENDIMIENTO_TOPE_PCT} % deja declarar ${fmtM3(tope)} m³ y este día lleva ${fmtM3(j.m3)}: junta días o revisa el reparto.`;
    }
    anterior ??= j.dia;
  }
  /* Un día futuro sin escribir no es «lo que falta»: se registra cuando pase.
     Sin esto «Completar» declaraba hoy la producción de días que no pasaron. */
  for (const j of jornadas) if (j.corridaId == null && j.estado !== "sin-produccion" && j.fecha > hoy) j.enEspera = true;

  return { oculto: false, motivo: null, jornadas, noDisponibles, sinAtribuirM3 };
}

/* ── Fase 4: completar un lote que ya tiene producción ───────────────────── */

/** Una corrida viva del lote, para elegir a cuál sumar o de cuál reprocesar. */
export interface CorridaDelLoteParaCompletar {
  id: string;
  lineNo: number;
  fecha: string;
  producto: string | null;
  declaradoM3: number;
  /** Lo que sigue en planta (declarado − despachado − reprocesado): techo del LRE. */
  disponibleM3: number;
  /** Cuánto más se le puede sumar bajo el tope (ADR-358); `null` = nada. */
  margen: CorridaAMedioDeclarar | null;
}

export interface PlanCompletar {
  /** Se ofrece sólo si el lote ya declaró producción. */
  ofrecer: boolean;
  loteId: string;
  loteCode: string;
  /** Lo declarado por todas las corridas vivas del lote, en m³. */
  declaradoM3: number;
  /** Rolliza que ya entró a la sierra (el lote menos lo que sigue libre). */
  consumidoM3: number;
  /** `tope(consumido) − declarado`: cuánto más admite el lote entero (derivado). */
  margenLoteM3: number;
  /** Lo que la distribución le da al bloque y no se escribió desde acá. */
  lineas: AsignacionGrupo[];
  /** Trozas del bloque (o del lote, si el bloque salió de él) que siguen libres. */
  trozasLibres: { id: string; etiqueta: string; volumenM3: number }[];
  rollizaLibreM3: number;
  /** LPC como corrida nueva: lo máximo que admite la rolliza libre. */
  topeCorridaNuevaM3: number;
  /** Vivas y declaradas, la más reciente primero. */
  corridas: CorridaDelLoteParaCompletar[];
}

export function completarDelLote(
  bd: Pick<BloqueDistribuido, "bloque" | "porDia">,
  lote: LoteParaLibro | null | undefined,
): PlanCompletar | null {
  const b = bd.bloque;
  if (!lote || !b.loteId || esAserradaDirecta(b)) return null;
  const vivas = (lote.corridas ?? []).filter((c) => c.viva);
  const declaradas = vivas.filter((c) => c.quantity != null && Number(c.quantity) > 0 && (c.unit ?? "m3") === "m3");
  const declaradoM3 = r4(declaradas.reduce((a, c) => a + Number(c.quantity), 0));
  const libresLote = lote.trozas.filter((t) => !t.consumidaEnId && vol(t) > 0);
  const consumidoM3 = r4(Math.max(0, (Number(lote.volumenM3) || 0) - libresLote.reduce((a, t) => a + vol(t), 0)));

  /* El bloque traído con sus trozas usa las suyas; el que salió del lote ES el lote. */
  const ids = b.trozaIds && b.trozaIds.length > 0 ? new Set(b.trozaIds) : null;
  const libres = libresLote
    .filter((t) => !ids || ids.has(t.id))
    .sort((x, y) => vol(y) - vol(x) || x.id.localeCompare(y.id));
  const rollizaLibreM3 = r4(libres.reduce((a, t) => a + vol(t), 0));

  /* Lo que falta: los días que no se escribieron desde acá, sin las líneas
     que ya salieron con «Completar». */
  const escritos = new Set((b.jornadasLibro ?? []).filter((j) => vivas.some((c) => c.id === j.corridaId)).map((j) => j.dia));
  const completadas = clavesCompletadas(b, new Set(vivas.map((c) => c.id)));
  const lineas = bd.porDia
    .filter((d) => !escritos.has(d.dia))
    .reduce<AsignacionGrupo[]>((acc, d) => juntarGrupos(acc, d.grupos), [])
    .filter((g) => g.piezas > 0 && g.m3 > 0 && !completadas.has(g.clave));

  const margenes = new Map(
    corridasAMedioDeclarar(
      declaradas.map((c) => ({
        id: c.id,
        lineNo: c.lineNo,
        entryDate: c.entryDate,
        productType: c.productType,
        speciesCommon: c.speciesCommon ?? null,
        volumeInputM3: c.volumeInputM3 ?? null,
        quantity: c.quantity,
        unit: c.unit,
        status: c.status,
      })),
    ).map((m) => [m.id, m]),
  );
  const corridas = declaradas
    .map((c) => ({
      id: c.id,
      lineNo: c.lineNo,
      fecha: String(c.entryDate).slice(0, 10),
      producto: c.productType,
      declaradoM3: r4(Number(c.quantity)),
      disponibleM3: r4(Math.max(0, Number(c.quantity) - (Number(c.despachadoQty) || 0) - (Number(c.reprocesadoQty) || 0))),
      margen: margenes.get(c.id) ?? null,
    }))
    .sort((x, y) => y.lineNo - x.lineNo);

  return {
    ofrecer: declaradas.length > 0,
    loteId: lote.id,
    loteCode: lote.code,
    declaradoM3,
    consumidoM3,
    margenLoteM3: r4(Math.max(0, topeDeclarableM3(consumidoM3) - declaradoM3)),
    lineas,
    trozasLibres: libres.map((t) => ({ id: t.id, etiqueta: rotulo(t), volumenM3: vol(t) })),
    rollizaLibreM3,
    topeCorridaNuevaM3: topeDeclarableM3(rollizaLibreM3),
    corridas,
  };
}

/** Las líneas elegidas, sumadas: lo que el complemento declara. */
export function sumaDeLineas(lineas: readonly AsignacionGrupo[]): { piezas: number; m3: number; pieTablar: number } {
  return {
    piezas: lineas.reduce((a, g) => a + g.piezas, 0),
    m3: r4(lineas.reduce((a, g) => a + g.m3, 0)),
    pieTablar: Math.round(lineas.reduce((a, g) => a + g.pieTablar, 0) * 100) / 100,
  };
}

/**
 * Por qué el complemento LPC elegido no se puede declarar (o `null`).
 *
 * Con rolliza libre es una corrida NUEVA del lote, con su propio tope. Sin
 * rolliza, una corrida nueva no tendría materia prima —y el servidor no puede
 * medir el 56 % sobre cero—, así que lo que falta se suma a una corrida del
 * lote que todavía tiene margen (ADR-361: el Libro gana filas, no las reescribe).
 */
export function motivoLpc(
  plan: PlanCompletar,
  elegidas: readonly AsignacionGrupo[],
  destino: { corridaId: string | null; fecha: string; hoy: string },
): string | null {
  const { m3 } = sumaDeLineas(elegidas);
  if (elegidas.length === 0 || !(m3 > 0)) return "Elige al menos una línea de lo que falta.";
  if (plan.trozasLibres.length > 0) {
    if (!fechaValida(destino.fecha)) return "Pon la fecha de la corrida.";
    if (destino.fecha > destino.hoy) return `El ${fechaCorta(destino.fecha)} todavía no pasó: el Libro no registra el futuro.`;
    if (m3 > plan.topeCorridaNuevaM3 + TOL_TOPE_M3) {
      return `Con ${fmtM3(plan.rollizaLibreM3)} m³ de rolliza libre el tope del ${RENDIMIENTO_TOPE_PCT} % deja ${fmtM3(plan.topeCorridaNuevaM3)} m³ y elegiste ${fmtM3(m3)}.`;
    }
    return null;
  }
  const c = plan.corridas.find((x) => x.id === destino.corridaId);
  if (!c) return "Elige a qué corrida del lote se suma.";
  if (!c.margen) return `La corrida N° ${c.lineNo} ya está en el tope del ${RENDIMIENTO_TOPE_PCT} %: lo que falta va como recuperación (LRE).`;
  if (m3 > c.margen.margenM3 + TOL_TOPE_M3) {
    return `A la corrida N° ${c.lineNo} le quedan ${fmtM3(c.margen.margenM3)} m³ bajo el tope y elegiste ${fmtM3(m3)}.`;
  }
  return null;
}
