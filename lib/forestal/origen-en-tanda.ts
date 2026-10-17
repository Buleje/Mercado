/**
 * «¿De qué trozas salió?» EN TANDA (ADR-447 §2): varias corridas sin origen a
 * la vez, sin que una troza vaya a dos.
 *
 * El diagnóstico de a una (`diagnosticarSinOrigen`) mira cada corrida contra el
 * patio entero: dos Mashonaste pueden recibir la misma troza. Acá la tanda se
 * arma por especie + permiso, la corrida más vieja primero, con el MISMO reparto
 * de «Descontar la madera usada» (`repartoDelGrupo`: primero cada corrida cubre
 * lo que produjo, después se completa hasta el 56 %). No hay un segundo
 * algoritmo de reparto.
 *
 * Las reglas de qué troza puede ir son las de `proponerTrozas` —especie,
 * permiso, lote de su especie y permiso, guía recibida, fila de su especie, I2
 * por fila, T3 por corrida (lo hace el reparto)—, y siempre `≤`: lo que falta
 * queda sin atribuir, nunca se fuerza.
 *
 * `simularArreglos` dice cuántas quedan listas hoy, tras corregir las llegadas
 * que proponen los arreglos y tras recibir las guías pendientes, y cuántas
 * frena la regla del permiso. Es una MEDICIÓN: no escribe ni cambia datos.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */

import { normalizarCodigoContrato } from "./contratos";
import { propuestaDeLlegada } from "./fecha-de-llegada";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { diaDelLibro } from "./recepcion-antes-de-la-sierra";
import { repartoDelGrupo } from "./vincular-desde-permiso";
import type { CorridaEnTanda } from "./vincular-en-tanda";
import { TOPE_RENDIMIENTO_PCT } from "./vincular-produccion";
import {
  aPropuesta,
  clavePermiso,
  comoConsumible,
  deUnSoloPermiso,
  diagnosticarSinOrigen,
  loteAjeno,
  mismoPermiso,
  ordenPropuesta,
  type ContextoDelPatio,
  type CorridaParaDiagnostico,
  type DiagnosticoSinOrigen,
  type GuiaDelArreglo,
  type MotivoSinOrigen,
  type OpcionesDeDiagnostico,
  type TrozaParaDiagnostico,
  type TrozaPropuesta,
  type VincularTrozasPedido,
} from "./vincular-trozas";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = (xs: readonly { m3: number }[]) => r4(xs.reduce((a, x) => a + x.m3, 0));
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// ── Contrato con la pantalla ────────────────────────────────────────────────

/** Una corrida que entra en la tanda, con SUS trozas (ninguna está en otra). */
export interface CorridaEnLaTanda {
  corridaId: string;
  lineNo: number | null;
  /** AAAA-MM-DD. */
  fecha: string;
  especie: string;
  permiso: string | null;
  m3Producido: number;
  trozas: TrozaPropuesta[];
  m3Trozas: number;
  /** `producido ÷ troza × 100`. */
  rendimientoPct: number | null;
  /** Pasa el 56 % de la plaza: se avisa, se firma igual (ADR-358). */
  sobreElTope: boolean;
}

/** Una corrida lista de a una que NO entra junto con las demás. */
export interface FueraDeLaTanda {
  corridaId: string;
  lineNo: number | null;
  fecha: string;
  especie: string;
  m3Producido: number;
  /** `sin_madera`: la del grupo no alcanza para todas; `regla`: el reparto la frena (volumen, fecha). */
  motivo: "sin_madera" | "regla";
  detalle: string;
}

/** Las corridas de UNA especie y UN permiso, que reparten la misma madera. */
export interface GrupoDeLaTanda {
  /** `claveEspecie|clavePermiso`. */
  clave: string;
  especie: string;
  permiso: string | null;
  /** La más vieja primero. */
  corridas: CorridaEnLaTanda[];
  fuera: FueraDeLaTanda[];
  m3Producido: number;
  m3Trozas: number;
}

export interface PropuestaDeTandaOrigen {
  /** El grupo con la corrida más vieja, primero. */
  grupos: GrupoDeLaTanda[];
  /** Listas de a una (motivo `lista`, mes abierto): pueden ser más que las que entran juntas. */
  listas: number;
  /** Las que entran en la tanda. */
  vinculables: number;
  /** m³ de producto de las que entran. */
  m3Producido: number;
  /** m³ de troza que se les atribuye. */
  m3Trozas: number;
  /** El cuerpo de `POST { tanda }`, la corrida más vieja primero. */
  pedido: VincularTrozasPedido[];
}

// ── La tanda ────────────────────────────────────────────────────────────────

const porFecha = (a: CorridaParaDiagnostico, b: CorridaParaDiagnostico) =>
  (diaDelLibro(a.fecha) ?? "").localeCompare(diaDelLibro(b.fecha) ?? "") || (a.lineNo ?? 0) - (b.lineNo ?? 0);

const sinPermiso = (c: CorridaParaDiagnostico) =>
  !c.permiso.contratoId && !normalizarCodigoContrato(c.permiso.codigo ?? "");

/**
 * Las trozas que el grupo puede usar, sin T3 (eso depende de cada corrida y lo
 * decide el reparto). Las mismas reglas que `proponerTrozas`.
 */
function poolDelGrupo(
  rep: CorridaParaDiagnostico,
  clave: string,
  trozas: readonly TrozaParaDiagnostico[],
  usadas: ReadonlySet<string>,
  usoFila: ReadonlyMap<string, number>,
  ignorarPermiso: boolean,
): TrozaParaDiagnostico[] {
  let pool = trozas.filter((t) => {
    if (usadas.has(t.id) || t.fuera != null || !t.guiaRecibida) return false;
    if (claveEspecie(t.especie) !== clave) return false;
    const claveFila = claveEspecie(t.fila.especie);
    if (claveFila && claveFila !== clave) return false;
    if (!ignorarPermiso && !mismoPermiso(rep.permiso, t.permiso)) return false;
    return !loteAjeno(rep, clave, t.lote, ignorarPermiso);
  });
  if (!ignorarPermiso && sinPermiso(rep)) pool = deUnSoloPermiso(pool);
  pool.sort(ordenPropuesta);
  /* I2 por fila, contando lo que las corridas anteriores de la tanda ya
     tomaron de esa fila: el servidor lo vuelve a mirar bajo lock. */
  const enPool = new Map<string, number>();
  return pool.filter((t) => {
    const f = t.fila;
    const tope = r4(f.m3 - f.consumidoM3 - (usoFila.get(f.id) ?? 0));
    const llevaria = r4((enPool.get(f.id) ?? 0) + t.m3);
    if (llevaria > tope + 1e-9) return false;
    enPool.set(f.id, llevaria);
    return true;
  });
}

function textoFuera(frena: string, especie: string, fecha: string, producido: number, mensaje: string | null): string {
  if (!(producido > 0)) return "No declara lo producido en m³: vincúlala de a una.";
  if (frena === "fecha") return `Ninguna troza del grupo estaba en el patio el ${ddmm(fecha)}.`;
  if (frena === "regla") return mensaje ?? "El reparto no le deja madera suficiente.";
  return `La madera de ${especie} de este permiso no alcanza para todas: la toman las corridas anteriores de la tanda.`;
}

/** La tanda sobre un diagnóstico ya hecho (lo usa `simularArreglos` para no diagnosticar dos veces). */
function tandaDesde(
  diag: DiagnosticoSinOrigen,
  corridas: readonly CorridaParaDiagnostico[],
  trozas: readonly TrozaParaDiagnostico[],
  meta: number,
  ignorarPermiso: boolean,
): PropuestaDeTandaOrigen {
  const porId = new Map(corridas.map((c) => [c.id, c]));
  const listas = diag.corridas.filter((d) => d.motivo === "lista" && !d.mesCerrado);

  const grupos = new Map<string, CorridaParaDiagnostico[]>();
  for (const d of listas) {
    const c = porId.get(d.corridaId);
    if (!c) continue;
    const k = `${claveEspecie(c.especie)}|${ignorarPermiso ? "" : (clavePermiso(c.permiso) ?? "")}`;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const enOrden = [...grupos.entries()]
    .map(([k, cs]) => [k, [...cs].sort(porFecha)] as const)
    .sort((a, b) => porFecha(a[1][0]!, b[1][0]!));

  const usadas = new Set<string>();
  const usoFila = new Map<string, number>();
  const trozaPorId = new Map(trozas.map((t) => [t.id, t]));
  const salida: GrupoDeLaTanda[] = [];

  for (const [clave, cs] of enOrden) {
    const rep = cs[0]!;
    const claveEsp = claveEspecie(rep.especie);
    const especie = rep.especie?.trim() || claveEsp;
    const pool = poolDelGrupo(rep, claveEsp, trozas, usadas, usoFila, ignorarPermiso);
    const enTanda: CorridaEnTanda[] = cs.map((c) => ({
      id: c.id,
      lineNo: c.lineNo,
      especie,
      producidoM3: r4(c.m3Producido || 0),
      largoMaxPiezaM: null,
      fecha: diaDelLibro(c.fecha) ?? "",
      tieneMateriaPrima: false,
    }));
    const desde = pool.map((t) => t.fechaIngreso ?? "").filter(Boolean).sort()[0] ?? null;
    const { reparto, porCorrida } = repartoDelGrupo(enTanda, especie, pool.map(comoConsumible), meta, {
      desde,
      hayAptas: pool.length > 0,
    });

    const grupo: GrupoDeLaTanda = {
      clave,
      especie,
      permiso: rep.permiso.codigo?.trim() || null,
      corridas: [],
      fuera: [],
      m3Producido: 0,
      m3Trozas: 0,
    };
    for (const r of reparto) {
      const c = porId.get(r.corrida.id)!;
      const fecha = diaDelLibro(c.fecha) ?? "";
      const producido = r4(c.m3Producido || 0);
      const ids = porCorrida[r.corrida.id];
      if (r.frena != null || !ids || ids.length === 0) {
        grupo.fuera.push({
          corridaId: c.id,
          lineNo: c.lineNo,
          fecha,
          especie,
          m3Producido: producido,
          motivo: r.frena === "regla" ? "regla" : "sin_madera",
          detalle: textoFuera(r.frena ?? "se-acabo", especie, fecha, producido, r.mensaje),
        });
        continue;
      }
      const suyas = ids.map((id) => trozaPorId.get(id)!).filter(Boolean);
      for (const t of suyas) {
        usadas.add(t.id);
        usoFila.set(t.fila.id, r4((usoFila.get(t.fila.id) ?? 0) + t.m3));
      }
      const m3Trozas = suma(suyas);
      const pct = m3Trozas > 0 && producido > 0 ? r2((producido / m3Trozas) * 100) : null;
      grupo.corridas.push({
        corridaId: c.id,
        lineNo: c.lineNo,
        fecha,
        especie,
        permiso: c.permiso.codigo?.trim() || null,
        m3Producido: producido,
        trozas: suyas.map(aPropuesta),
        m3Trozas,
        rendimientoPct: pct,
        sobreElTope: pct != null && pct > TOPE_RENDIMIENTO_PCT,
      });
    }
    grupo.m3Producido = r4(grupo.corridas.reduce((a, c) => a + c.m3Producido, 0));
    grupo.m3Trozas = r4(grupo.corridas.reduce((a, c) => a + c.m3Trozas, 0));
    salida.push(grupo);
  }

  const todas = salida.flatMap((g) => g.corridas);
  const pedido = [...todas]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.lineNo ?? 0) - (b.lineNo ?? 0))
    .map((c) => ({ corridaId: c.corridaId, trozaIds: c.trozas.map((t) => t.trozaId) }));
  return {
    grupos: salida,
    listas: listas.length,
    vinculables: todas.length,
    m3Producido: r4(todas.reduce((a, c) => a + c.m3Producido, 0)),
    m3Trozas: r4(todas.reduce((a, c) => a + c.m3Trozas, 0)),
    pedido,
  };
}

/**
 * La tanda que se propone: qué corridas se vinculan juntas y con qué trozas.
 * La persona la revisa y confirma; el servidor vuelve a decidir cada una bajo
 * lock (`ForestVincularTrozasDB.vincularTanda`).
 */
export function proponerTandaDeOrigen(
  corridas: readonly CorridaParaDiagnostico[],
  trozas: readonly TrozaParaDiagnostico[],
  meta: number = RENDIMIENTO_META,
  opciones: OpcionesDeDiagnostico = {},
): PropuestaDeTandaOrigen {
  const diag = diagnosticarSinOrigen(corridas, trozas, meta, opciones);
  return tandaDesde(diag, corridas, trozas, meta, opciones.ignorarPermiso === true);
}

// ── Qué pasaría con cada arreglo (medición, no escritura) ───────────────────

export interface EscenarioDeArreglo {
  /** Listas de a una. */
  listas: number;
  /** Las que entran juntas en la tanda. */
  enTanda: number;
  /** m³ de producto de las que entran en la tanda. */
  m3EnTanda: number;
  porMotivo: Record<MotivoSinOrigen, number>;
  /** N° de las que entran en la tanda, en orden. */
  lineNos: (number | null)[];
}

export interface SimulacionDeArreglos {
  hoy: EscenarioDeArreglo;
  /** Tras corregir la llegada de las guías que proponen los arreglos, a la fecha de su guía. */
  trasLlegada: EscenarioDeArreglo & { guias: string[] };
  /** Además, tras recibir las guías pendientes del patio con la fecha de su guía. */
  trasRecibir: EscenarioDeArreglo & { guias: string[] };
  /** En `trasRecibir`: las que quedarían listas si no se mirara el permiso. La regla las frena, y está bien. */
  frenaElPermiso: { corridas: number; lineNos: (number | null)[] };
}

function escenario(
  corridas: readonly CorridaParaDiagnostico[],
  trozas: readonly TrozaParaDiagnostico[],
  meta: number,
  opciones: OpcionesDeDiagnostico,
): { e: EscenarioDeArreglo; diag: DiagnosticoSinOrigen } {
  const diag = diagnosticarSinOrigen(corridas, trozas, meta, opciones);
  const t = tandaDesde(diag, corridas, trozas, meta, opciones.ignorarPermiso === true);
  const enTanda = t.grupos.flatMap((g) => g.corridas);
  return {
    diag,
    e: {
      listas: t.listas,
      enTanda: t.vinculables,
      m3EnTanda: t.m3Producido,
      porMotivo: diag.porMotivo,
      lineNos: [...enTanda].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.lineNo ?? 0) - (b.lineNo ?? 0)).map((c) => c.lineNo),
    },
  };
}

/** Las guías que los arreglos proponen corregir, con la fecha propuesta (la más temprana si dos la nombran). */
function llegadasPropuestas(diag: DiagnosticoSinOrigen): Map<string, string> {
  const out = new Map<string, string>();
  const anotar = (gs: readonly GuiaDelArreglo[] | undefined) => {
    for (const g of gs ?? []) {
      if (!g.gtfNumber || !g.propuesta) continue;
      const prev = out.get(g.gtfNumber);
      if (!prev || g.propuesta < prev) out.set(g.gtfNumber, g.propuesta);
    }
  };
  for (const c of diag.corridas) {
    if (c.arreglo.tipo === "corregir_llegada") anotar(c.arreglo.guias);
    if (c.arreglo.tipo === "recibir_guia") anotar(c.arreglo.corregirTambien);
  }
  return out;
}

/**
 * Las trozas con la llegada que proponen los arreglos «corregir la llegada» de
 * `diag` —la fecha de su guía, sólo hacia atrás y sólo las que siguen a su guía
 * (`sigueALaGuia`, ADR-434)— y qué guías se corrigen. Es el escenario «tras
 * corregir las llegadas» de `simularArreglos`; también lo usa «Soltar trozas»
 * (ADR-447 §6) para decir qué quedaría listo si además se corrigen.
 */
export function conLlegadasCorregidas(
  trozas: readonly TrozaParaDiagnostico[],
  diag: DiagnosticoSinOrigen,
  /** Sólo estas guías (por número); sin él, todas las que proponen los arreglos. */
  soloGuias?: ReadonlySet<string>,
): { trozas: TrozaParaDiagnostico[]; guias: string[] } {
  const llegadas = llegadasPropuestas(diag);
  if (soloGuias) for (const g of [...llegadas.keys()]) if (!soloGuias.has(g)) llegadas.delete(g);
  const corregidas = trozas.map((t) => {
    const p = t.gtfNumber ? llegadas.get(t.gtfNumber) : undefined;
    if (!p || !t.guiaRecibida || t.llegada?.sigueALaGuia === false) return t;
    return t.fechaIngreso && p < t.fechaIngreso ? { ...t, fechaIngreso: p } : t;
  });
  return { trozas: corregidas, guias: [...llegadas.keys()].sort() };
}

/**
 * Hoy / tras corregir las llegadas / tras recibir las guías pendientes, y
 * cuánto frena el permiso. Corregir una guía mueve sólo las trozas que la
 * siguen (`sigueALaGuia`, como el escritor de ADR-434) y sólo hacia atrás: la
 * propuesta es la fecha de la guía, nunca una inventada.
 */
export function simularArreglos(
  corridas: readonly CorridaParaDiagnostico[],
  trozas: readonly TrozaParaDiagnostico[],
  contexto: ContextoDelPatio,
  meta: number = RENDIMIENTO_META,
): SimulacionDeArreglos {
  const opciones: OpcionesDeDiagnostico = { contexto };
  const hoy = escenario(corridas, trozas, meta, opciones);

  const { trozas: corregidas, guias: guiasCorregidas } = conLlegadasCorregidas(trozas, hoy.diag);
  const trasLlegada = escenario(corridas, corregidas, meta, opciones);

  const recibidas = new Set<string>();
  const conRecibo = corregidas.map((t) => {
    if (t.guiaRecibida) return t;
    const p = t.llegada ? propuestaDeLlegada({ guia: t.llegada.guia, asiento: t.llegada.asiento }, contexto.hoy, false) : null;
    if (t.gtfNumber) recibidas.add(t.gtfNumber);
    return { ...t, guiaRecibida: true, fechaIngreso: p?.dia ?? t.fechaIngreso };
  });
  const trasRecibir = escenario(corridas, conRecibo, meta, opciones);
  const sinPermiso = escenario(corridas, conRecibo, meta, { contexto, ignorarPermiso: true });

  const conPermiso = new Set(trasRecibir.diag.corridas.filter((c) => c.motivo === "lista" && !c.mesCerrado).map((c) => c.corridaId));
  const frenadas = sinPermiso.diag.corridas.filter((c) => c.motivo === "lista" && !c.mesCerrado && !conPermiso.has(c.corridaId));

  return {
    hoy: hoy.e,
    trasLlegada: { ...trasLlegada.e, guias: guiasCorregidas },
    trasRecibir: { ...trasRecibir.e, guias: [...recibidas].sort() },
    frenaElPermiso: { corridas: frenadas.length, lineNos: frenadas.map((c) => c.lineNo) },
  };
}
