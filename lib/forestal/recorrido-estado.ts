/**
 * recorrido-estado — el estado del «Recorrido del permiso» DERIVADO del Libro
 * (ADR-519, decisión 2). Puro: el servidor junta lo leído (distribución, lote
 * con sus corridas, trozas elegibles, anexos, despachos) y esto decide cada
 * paso. Nada de lo que devuelve se guarda.
 *
 * Reglas que no se negocian acá:
 * - «Hecho» lo dice el Libro, no la propuesta: un día que la pantalla cuenta y
 *   el Libro no tiene (apagado por «Completar», o su madera salió en otra
 *   corrida) se nombra como tal en el detalle, no se cuenta como jornada.
 * - El plazo usa el predicado de `ctp-compliance.ts` (`estaFueraDePlazo`), el
 *   mismo del badge y del Excel; acá no hay otra cuenta de días hábiles.
 * - El faltante se muestra (`sinAtribuirM3`), nunca se fuerza.
 */

import {
  siguientePaso,
  type EstadoRecorrido,
  type PasoDelRecorrido,
} from "./recorrido-permiso";
import { aprovechableDe, capacidadDe, diasDe, esAserradaDirecta, type BloqueRolliza, type JornadaEnLibro } from "./cubicacion-reparto";
import { trozasDelBloque } from "./trozas-para-bloque";
import { estaFueraDePlazo } from "./ctp-compliance";
import { normalizarCodigoContrato } from "./contratos";
import { claveEspecie } from "./loth-constants";
import { PT_POR_M3 } from "./cubicacion";
import { RENDIMIENTO_TOPE_PCT } from "./produccion-paquetes";
import { sumarDias } from "./consumo-en-jornadas";
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que `elegiblesDe` dice de cada troza del bloque (T1, recepción, permiso). */
export interface TrozaDelRecorrido {
  id: string;
  codigo: string | null;
  volumenM3: number;
  permiso: string | null;
  porRecepcionar: boolean;
  consumidaEnId: string | null;
  motivo: string | null;
}

/** El lote del bloque con lo que el Libro sabe de él. */
export interface LoteDelRecorrido {
  id: string;
  code: string;
  status: string;
  trozas: { id: string; consumidaEnId?: string | null }[];
  corridas?: {
    id: string;
    lineNo: number;
    viva: boolean;
    quantity: number | null;
    volumeInputM3?: number | null;
    unit: string | null;
  }[];
}

export interface AnexoDelRecorrido {
  id: string;
  numero: string;
  gtf: string;
  fecha: string;
  permiso?: string | null;
  especieGlobal?: string;
  despachoIds?: string[];
  reemplazadoPor?: string | null;
}

export interface DespachoDelRecorrido {
  id: string;
  gtfNumber: string | null;
  status: string;
  entryDate: Date | string;
}

export interface DatosDelRecorrido {
  distribucionId: string;
  bloque: BloqueRolliza;
  /** Lo que el bloque ampara en la distribución de la pantalla; sin él, la capacidad del bloque. */
  usadoM3?: number | null;
  trozas: TrozaDelRecorrido[];
  noEncontradas: string[];
  /** `undefined` = el bloque no tiene `loteId`; `null` = lo tiene y el lote ya no existe. */
  lote: LoteDelRecorrido | null | undefined;
  /** Los anexos guardados del negocio (se filtran acá por permiso, especie y fecha). */
  anexos: AnexoDelRecorrido[];
  /** Los despachos citados por esos anexos (vigentes y anulados). */
  despachos: DespachoDelRecorrido[];
  /** Hoy, `AAAA-MM-DD` (día de Lima). */
  hoy: string;
  /**
   * Con los días de la pantalla (POST con `porDia`): por qué no queda ningún
   * día listo para registrar (`faltanDiasListos`). Sin esto el paso quedaba
   * «pendiente» mudo y el botón no hacía nada.
   */
  sinDiasListos?: { code: string; motivo: string } | null;
}

const permisoClave = (p: string | null | undefined) => normalizarCodigoContrato((p ?? "").trim());

/**
 * El último día en plazo de registro de una línea fechada `fecha`: el mayor día
 * en que `estaFueraDePlazo` todavía dice que no. Se busca con el MISMO
 * predicado del libro (no hay otra cuenta de hábiles); 2 hábiles caben en 9
 * días corridos aun con feriado de fin de semana largo.
 */
export function venceElRegistro(fecha: Date | string): string {
  /* La actividad cuenta desde la medianoche UTC de su día (la convención de
     `diasHabilesDeRegistro`), aunque el Libro la guarde a mediodía. */
  const f = new Date(typeof fecha === "string" && fecha.length === 10 ? `${fecha}T12:00:00.000Z` : fecha);
  const dia = (n: number) => new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + n));
  const base = dia(0);
  let ultimo = base;
  for (let n = 1; n <= 9; n++) {
    /* Registrar al último segundo del día n. */
    if (estaFueraDePlazo({ entryDate: base, createdAt: new Date(dia(n + 1).getTime() - 1) })) break;
    ultimo = dia(n);
  }
  return ultimo.toISOString().slice(0, 10);
}

/**
 * Los Anexos 04 vigentes (no reemplazados) de este permiso y especie, emitidos
 * desde el día del bloque; el más reciente primero. El servidor lo usa también
 * para saber qué despachos leer.
 */
export function anexosDelBloque<A extends AnexoDelRecorrido>(
  anexos: readonly A[],
  permiso: string | null,
  b: Pick<BloqueRolliza, "especie" | "fecha">,
): A[] {
  if (!permiso) return [];
  const clave = permisoClave(permiso);
  return anexos
    .filter(
      (a) =>
        !a.reemplazadoPor &&
        permisoClave(a.permiso) === clave &&
        (!a.especieGlobal || claveEspecie(a.especieGlobal) === claveEspecie(b.especie)) &&
        (!b.fecha || a.fecha >= b.fecha),
    )
    .sort((x, y) => y.fecha.localeCompare(x.fecha));
}

/** Deriva el estado de cada paso del bloque y el siguiente que falta. */
export function derivarRecorrido(d: DatosDelRecorrido): EstadoRecorrido {
  const b = d.bloque;
  const pct = aprovechableDe(b);
  const amparadoM3 = r4(d.usadoM3 != null && d.usadoM3 >= 0 ? d.usadoM3 : capacidadDe(b));
  const delBloque = new Set(trozasDelBloque(b));
  const trozas = d.trozas.filter((t) => delBloque.has(t.id));
  const rollizaM3 = r4(trozas.reduce((a, t) => a + (Number(t.volumenM3) || 0), 0));

  /* El permiso del recorrido: el del bloque o, si no lo dice, el único de sus trozas. */
  const permisosDeTrozas = [...new Set(trozas.map((t) => (t.permiso ?? "").trim()).filter(Boolean))];
  const permiso = (b.permiso ?? "").trim() || (permisosDeTrozas.length === 1 ? permisosDeTrozas[0] : null);

  /* Las corridas vivas del bloque: las de sus jornadas y las de «Completar». */
  const vivas = new Map((d.lote?.corridas ?? []).filter((c) => c.viva).map((c) => [c.id, c]));
  const idsDelBloque = new Set<string>([
    ...(b.jornadasLibro ?? []).map((j) => j.corridaId),
    ...(b.complementos ?? []).map((c) => c.corridaId).filter((x): x is string => !!x),
  ]);
  const corridasDelBloque = [...idsDelBloque].map((x) => vivas.get(x)).filter((c): c is NonNullable<typeof c> => !!c);
  const declaradas = corridasDelBloque.filter((c) => c.quantity != null && (c.unit ?? "m3") === "m3");
  const producidoM3 = r4(declaradas.reduce((a, c) => a + (Number(c.quantity) || 0), 0));
  const consumidaM3 = r4(declaradas.reduce((a, c) => a + (Number(c.volumeInputM3) || 0), 0));

  const pasos: PasoDelRecorrido[] = [];

  /* 1 · Datos: guías recibidas y un solo permiso. Una troza ya aserrada no se
     juzga acá (su «no elegible» es justamente que ya entró a la sierra). */
  {
    const sinConsumir = trozas.filter((t) => !t.consumidaEnId);
    const porRecibir = sinConsumir.filter((t) => t.porRecepcionar);
    if (delBloque.size === 0) {
      pasos.push({ paso: "datos", estado: "con_problema", ids: [], code: "SIN_TROZAS", motivo: "El bloque no tiene trozas del grupo: vuelve a armar el grupo en la distribución." });
    } else if (d.noEncontradas.length > 0) {
      pasos.push({
        paso: "datos",
        estado: "con_problema",
        ids: d.noEncontradas,
        code: "TROZA_NO_ENCONTRADA",
        motivo: `${plural(d.noEncontradas.length, "troza del bloque ya no existe", "trozas del bloque ya no existen")} en este negocio: vuelve a elegir las trozas.`,
      });
    } else if (porRecibir.length > 0) {
      pasos.push({
        paso: "datos",
        estado: "con_problema",
        ids: porRecibir.map((t) => t.id),
        code: "GUIA_SIN_RECIBIR",
        motivo: `${porRecibir[0].codigo ?? porRecibir[0].id}: ${porRecibir[0].motivo ?? "su guía no está recibida"}` +
          (porRecibir.length > 1 ? ` (y ${porRecibir.length - 1} más)` : "") + ". Recíbela en Ingresos.",
      });
    } else if (!permiso && permisosDeTrozas.length > 1) {
      pasos.push({
        paso: "datos",
        estado: "con_problema",
        ids: [],
        code: "PERMISO_DISTINTO",
        motivo: `Las trozas del bloque son de ${permisosDeTrozas.length} permisos (${permisosDeTrozas.join(", ")}): un recorrido es de un solo permiso.`,
      });
    } else if (!permiso) {
      pasos.push({ paso: "datos", estado: "con_problema", ids: [], code: "SIN_PERMISO", motivo: "Las guías de estas trozas no dicen su permiso: complétalo en el ingreso." });
    } else {
      pasos.push({ paso: "datos", estado: "hecho", ids: [], detalle: `${plural(trozas.length, "troza", "trozas")} · ${rollizaM3} m³ de rolliza · permiso ${permiso}` });
    }
  }

  /* 2 · Trozas: las que el bloque ampara de verdad (ADR-519, decisión 1). Una
     elegida que se fue a otro lote o a otra corrida se dice. */
  {
    const elegidas = (b.trozasElegidas ?? []).length > 0;
    const perdidas = trozas.filter((t) => t.motivo && !(t.consumidaEnId && idsDelBloque.has(t.consumidaEnId)) && !t.porRecepcionar);
    if (!elegidas) {
      pasos.push({ paso: "trozas", estado: "pendiente", ids: [], motivo: "Elige las trozas que ampara el bloque." });
    } else if (perdidas.length > 0) {
      pasos.push({
        paso: "trozas",
        estado: "con_problema",
        ids: perdidas.map((t) => t.id),
        code: "TROZA_NO_DISPONIBLE",
        motivo: `${perdidas[0].codigo ?? perdidas[0].id}: ${perdidas[0].motivo}` + (perdidas.length > 1 ? ` (y ${perdidas.length - 1} más)` : "") + ". Vuelve a elegir las trozas.",
      });
    } else {
      pasos.push({ paso: "trozas", estado: "hecho", ids: [...delBloque], detalle: `${plural(delBloque.size, "troza elegida", "trozas elegidas")} · ${rollizaM3} m³` });
    }
  }

  /* 3 · Lote: el `loteId` del bloque, vivo. */
  if (d.lote === undefined) {
    pasos.push({ paso: "lote", estado: "pendiente", ids: [], motivo: "Falta el lote de aserrío del bloque." });
  } else if (d.lote === null || d.lote.status === "anulado") {
    pasos.push({ paso: "lote", estado: "con_problema", ids: [], code: "LOTE_NO_ENCONTRADO", motivo: "El lote del bloque ya no existe o se anuló: vuelve a crearlo." });
  } else {
    pasos.push({ paso: "lote", estado: "hecho", ids: [d.lote.id], detalle: `Lote ${d.lote.code} · ${plural(d.lote.trozas.length, "troza", "trozas")}` });
  }

  /* 4 · Jornadas: lo que el Libro tiene de cada día. */
  const loteHecho = pasos[pasos.length - 1].estado === "hecho";
  if (esAserradaDirecta(b)) {
    pasos.push({ paso: "jornadas", estado: "no_aplica", ids: [], detalle: "Madera ya aserrada: no pasa por la sierra." });
  } else if (!loteHecho || !d.lote) {
    pasos.push({ paso: "jornadas", estado: "pendiente", ids: [] });
  } else {
    const dias = diasDe(b);
    const regs = (b.jornadasLibro ?? []).filter((j) => vivas.has(j.corridaId));
    const abiertas = regs.filter((j) => vivas.get(j.corridaId)?.quantity == null);
    const enLibro = regs.filter((j) => vivas.get(j.corridaId)?.quantity != null);
    const completados = (b.complementos ?? []).filter((c) => c.corridaId && vivas.has(c.corridaId)).length;
    /* Trozas del bloque que siguen en el lote sin entrar a una corrida viva. */
    const libres = d.lote.trozas.filter((t) => delBloque.has(t.id) && !(t.consumidaEnId && vivas.has(t.consumidaEnId)));
    const ids = enLibro.map((j) => j.corridaId);
    const base = `${enLibro.length} de ${plural(dias, "día", "días")} en el Libro` + (completados > 0 ? ` · ${completados} con «Completar»` : "");
    if (abiertas.length > 0) {
      const n = vivas.get(abiertas[0].corridaId)?.lineNo ?? abiertas[0].lineNo;
      pasos.push({
        paso: "jornadas",
        estado: "con_problema",
        ids,
        code: "CORRIDA_ABIERTA",
        motivo: `La corrida N° ${n} consumió sus trozas y falta declarar lo que salió: declárale la producción desde el Libro.`,
        detalle: base,
      });
    } else if (enLibro.length >= dias) {
      pasos.push({ paso: "jornadas", estado: "hecho", ids, detalle: base });
    } else if (libres.length === 0 && (enLibro.length > 0 || completados > 0)) {
      /* La propuesta cuenta estos días y el Libro no: su madera ya entró a la
         sierra por otro lado («Completar» u otra corrida). No hay más que registrar. */
      const faltan = dias - enLibro.length;
      pasos.push({
        paso: "jornadas",
        estado: "hecho",
        ids,
        detalle: `${base} · ${plural(faltan, "día no se registra", "días no se registran")}: su madera ya entró a la sierra en otra corrida`,
      });
    } else if (d.sinDiasListos) {
      pasos.push({ paso: "jornadas", estado: "con_problema", ids, code: d.sinDiasListos.code, motivo: d.sinDiasListos.motivo, detalle: base });
    } else if (d.usadoM3 === 0 && enLibro.length === 0) {
      /* La pantalla dice que la distribución no le asignó nada a este bloque. */
      pasos.push({ paso: "jornadas", estado: "con_problema", ids, code: "SIN_DIAS_LISTOS", motivo: SIN_ASERRADA, detalle: base });
    } else {
      pasos.push({ paso: "jornadas", estado: "pendiente", ids, detalle: base });
    }
  }

  /* 5 · Anexo 04: el guardado de este permiso y especie, desde la fecha del bloque. */
  const anexos = anexosDelBloque(d.anexos, permiso, b);
  if (anexos.length > 0) {
    pasos.push({ paso: "anexo", estado: "hecho", ids: anexos.map((a) => a.id), detalle: `Anexo ${anexos[0].numero} · GTF ${anexos[0].gtf}` });
  } else {
    pasos.push({ paso: "anexo", estado: "pendiente", ids: [], motivo: permiso ? `Emite el Anexo 04 del permiso ${permiso}.` : "Sin permiso no hay Anexo 04." });
  }

  /* 6 · Salida: los despachos vigentes, con N° de GTF, que cita ese anexo. */
  const citados = new Set(anexos.flatMap((a) => a.despachoIds ?? []));
  const salidas = d.despachos.filter((x) => citados.has(x.id) && x.status === "registrado" && (x.gtfNumber ?? "").trim());
  if (salidas.length > 0) {
    pasos.push({
      paso: "salida",
      estado: "hecho",
      ids: salidas.map((x) => x.id),
      detalle: `GTF ${[...new Set(salidas.map((x) => x.gtfNumber))].join(", ")}`,
    });
  } else {
    pasos.push({
      paso: "salida",
      estado: "pendiente",
      ids: [],
      motivo: anexos.length > 0 ? "Registra la salida con su guía desde el Anexo 04." : undefined,
    });
  }

  /* El plazo: de los anexos cuya salida TODAVÍA no está en el Libro, el que
     antes vence (si todavía no venció). Cuenta desde la fecha de la guía con
     el predicado del badge (`venceElRegistro` → `estaFueraDePlazo`). Una
     salida ya registrada no avisa: antes decía «Registrar hoy» con el
     recorrido 6/6 y la salida ya en el Libro (prueba del 27-10). */
  const conSalida = new Set(salidas.map((x) => x.id));
  const plazos = anexos
    .filter((a) => !(a.despachoIds ?? []).some((id) => conSalida.has(id)))
    .map((a) => ({ anexoId: a.id, gtfNumber: a.gtf?.trim() || null, venceEl: venceElRegistro(a.fecha) }))
    .filter((p) => p.venceEl >= d.hoy)
    .sort((x, y) => x.venceEl.localeCompare(y.venceEl));

  /* Lo que el bloque ampara y las trozas elegidas no alcanzan a dar (al tope
     menor entre el % del bloque y el 56 %). Derivado: no se fuerza. */
  const daLaRolliza = r4((rollizaM3 * Math.min(pct, RENDIMIENTO_TOPE_PCT)) / 100);
  const sinAtribuirM3 = esAserradaDirecta(b) ? 0 : r4(Math.max(0, amparadoM3 - Math.max(daLaRolliza, producidoM3)));

  return {
    distribucionId: d.distribucionId,
    bloqueId: b.id,
    permiso,
    especie: b.especie,
    rollizaM3,
    amparadoM3,
    producidoM3,
    producidoPt: Math.round(producidoM3 * PT_POR_M3),
    sinAtribuirM3,
    pasos,
    siguiente: siguientePaso(pasos),
    plazo: plazos[0] ?? null,
    rendimiento: esAserradaDirecta(b) ? null : { sugeridoPct: pct, realPct: consumidaM3 > 0 && declaradas.length > 0 ? r2((producidoM3 / consumidaM3) * 100) : null },
  };
}

/** Lo mínimo del lote para reconocer una jornada huérfana. */
export interface LoteParaAdoptar {
  trozas: { id: string; consumidaEnId?: string | null }[];
  corridas?: { id: string; lineNo: number; viva: boolean; quantity: number | null; entryDate?: Date | string | null; observations?: string | null }[];
}

/** Quién tiene ya anotado un lote o una corrida: «bloque B1 de la distribución Lote octubre». */
export interface TomadosPorOtros {
  lotes: ReadonlyMap<string, string>;
  corridas: ReadonlyMap<string, string>;
}

/**
 * Lo que ya es de OTRO bloque, en TODAS las distribuciones guardadas del
 * negocio (2.ª revisión de ADR-519): una distribución copiada o rehecha con
 * las mismas trozas no puede adoptar el lote ni las corridas del bloque
 * original — sería la misma producción amparada dos veces en el Anexo 04.
 */
export function tomadosPorOtros(
  distribuciones: readonly { id: string; nombre?: string | null; bloques: readonly BloqueRolliza[] }[],
  distribucionId: string,
  bloqueId: string,
): TomadosPorOtros {
  const lotes = new Map<string, string>();
  const corridas = new Map<string, string>();
  for (const d of distribuciones) {
    for (const b of d.bloques) {
      if (d.id === distribucionId && b.id === bloqueId) continue;
      const quien = `bloque ${b.etiqueta || "sin etiqueta"} de la distribución ${d.nombre || "sin nombre"}`;
      if (b.loteId && !lotes.has(b.loteId)) lotes.set(b.loteId, quien);
      const ids = [...(b.jornadasLibro ?? []).map((j) => j.corridaId), ...(b.corridaIds ?? []), ...(b.complementos ?? []).map((c) => c.corridaId)];
      for (const id of ids) if (id && !corridas.has(id)) corridas.set(id, quien);
    }
  }
  return { lotes, corridas };
}

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** La nota que dejan el Recorrido y «Al Libro» del cubicador: «Jornada N de M · bloque <etiqueta> · …». */
const esNotaDeLaJornada = (nota: string | null | undefined, dia: number, b: BloqueRolliza): boolean =>
  new RegExp(`^Jornada ${dia} de \\d+ · bloque ${escaparRegex(b.etiqueta || "sin etiqueta")}(?: ·|$)`).test((nota ?? "").trim());

const diaIso = (f: Date | string | null | undefined): string | null => {
  if (!f) return null;
  const iso = typeof f === "string" ? f : Number.isNaN(f.getTime()) ? "" : f.toISOString();
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
};

/**
 * Las jornadas que YA están en el Libro y el bloque no sabe (revisión de
 * ADR-519, A1: adoptar lo huérfano). Un pedido cortado entre la corrida y la
 * anotación —antes de que fueran una sola transacción, o la marca de otra
 * pantalla que no llegó— deja una corrida viva y declarada con trozas del
 * bloque que el plan ve como «ajena» y traba todos los días.
 *
 * Se adopta SÓLO lo inequívoco: corrida viva y declarada del lote, que no es
 * de ninguna jornada ni «Completar» del bloque, cuyas piezas consumidas son
 * todas del bloque, cuya fecha es la de un día sin corrida viva y cuya nota
 * dice «Jornada N de … · bloque <etiqueta>» (una corrida a mano del mismo día
 * no se adopta). Si dos corridas caen en el mismo día, no se adopta ninguna:
 * eso lo decide una persona mirando el Libro. `tomadas` = corridas que ya
 * anotó otro bloque (`tomadosPorOtros`). Sin `b.fecha` el día 1 es `hoy`.
 */
export function jornadasHuerfanas(
  b: BloqueRolliza,
  dias: readonly number[],
  lote: LoteParaAdoptar | null | undefined,
  hoy: string,
  tomadas: ReadonlySet<string> = new Set(),
): JornadaEnLibro[] {
  if (!lote || esAserradaDirecta(b) || dias.length === 0) return [];
  const vivas = new Map((lote.corridas ?? []).filter((c) => c.viva).map((c) => [c.id, c]));
  const nuestras = new Set<string>();
  const diasOcupados = new Set<number>();
  for (const j of b.jornadasLibro ?? []) {
    if (!vivas.has(j.corridaId)) continue;
    nuestras.add(j.corridaId);
    diasOcupados.add(j.dia);
  }
  for (const c of b.complementos ?? []) if (c.corridaId) nuestras.add(c.corridaId);
  const ids = new Set(trozasDelBloque(b));
  const inicio = typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : hoy;
  const diaPorFecha = new Map(dias.filter((d) => !diasOcupados.has(d)).map((d) => [sumarDias(inicio, d - 1), d]));

  const porDia = new Map<number, NonNullable<LoteParaAdoptar["corridas"]>>();
  for (const c of vivas.values()) {
    if (c.quantity == null || nuestras.has(c.id) || tomadas.has(c.id)) continue;
    const suyas = lote.trozas.filter((t) => t.consumidaEnId === c.id);
    if (suyas.length === 0 || suyas.some((t) => !ids.has(t.id))) continue;
    const fecha = diaIso(c.entryDate);
    const dia = fecha ? diaPorFecha.get(fecha) : undefined;
    if (dia == null || !esNotaDeLaJornada(c.observations, dia, b)) continue;
    porDia.set(dia, [...(porDia.get(dia) ?? []), c]);
  }
  /* Dos candidatas el mismo día = no se sabe cuál es: no se adopta ninguna. */
  return [...porDia.entries()]
    .sort(([a], [b2]) => a - b2)
    .flatMap(([dia, [c, ...otras]]) =>
      c && otras.length === 0 ? [{ dia, corridaId: c.id, lineNo: c.lineNo, estado: "declarada" as const, fecha: sumarDias(inicio, dia - 1) }] : [],
    );
}

export const SIN_ASERRADA = "No hay aserrada repartida en este bloque: carga lo aserrado en el cubicador.";

/** Lo que `faltanDiasListos` necesita del plan del Libro (`planLibroDeBloque`). */
export interface PlanParaDiasListos {
  oculto?: boolean;
  motivo: string | null;
  jornadas: { estado: string; motivo?: string | null; porOrden?: boolean }[];
}

/**
 * Por qué no queda ningún día «listo» para registrar, o `null` si queda uno
 * (o si ya están todos en el Libro, o si es una corrida abierta: eso ya lo
 * dice el paso con `CORRIDA_ABIERTA`). Lo usan la ruta (para no cortar en
 * silencio) y el estado derivado (para que el paso diga su motivo).
 */
export function faltanDiasListos(plan: PlanParaDiasListos): { code: string; motivo: string } | null {
  if (plan.oculto) return null;
  if (plan.jornadas.length === 0) return { code: "SIN_DIAS_LISTOS", motivo: SIN_ASERRADA };
  if (plan.jornadas.some((j) => j.estado === "lista")) return null;
  const faltan = plan.jornadas.filter((j) => j.estado !== "en-libro");
  if (faltan.length === 0 || faltan.some((j) => j.estado === "abierta")) return null;
  const motivo = plan.motivo ?? faltan.find((j) => j.estado === "apagada" && !j.porOrden && j.motivo)?.motivo;
  if (motivo) return { code: "JORNADA_NO_REGISTRABLE", motivo };
  if (faltan.every((j) => j.estado === "sin-produccion")) return { code: "SIN_DIAS_LISTOS", motivo: SIN_ASERRADA };
  return null;
}

