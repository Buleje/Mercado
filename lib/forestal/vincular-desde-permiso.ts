/**
 * «Descontar la madera usada» desde la ficha del permiso (ADR-432 + ADR-408).
 *
 * Brandon, 25-09: «30 corridas del permiso FMP-2026-007 no descuentan la madera
 * que usaron, así que el saldo dice que te quedan 135 m³ de rolliza aunque ya
 * sacaste ≈46 m³ de aserrada». Medido en Blas ese día: 30 corridas sin materia
 * prima en 11 especies, y las 46 trozas del permiso LIBRES (ninguna en un lote).
 *
 * Vincular escribe por `sumar-corrida`, que sólo mueve piezas DE UN LOTE. Esto
 * arma, por especie, qué corridas se pueden vincular y con qué trozas —y, sobre
 * todo, cuáles NO y por qué—. Las reglas siguen siendo las de
 * `revisarVinculacion` y el reparto el de `repartirEnTanda`: no hay una segunda
 * forma de decidir de qué madera salió una corrida.
 *
 * ## Lo que FRENA (revisión adversarial, 25-09, con los datos de Blas)
 *
 *  1. **Fecha**: a una corrida sólo le toca troza que ya estaba en el patio ese
 *     día (`fechaIngresoDeTroza`). En Blas las guías figuran recibidas el 23/09
 *     y las corridas son del 07 al 22/09: casi todo se frena, y se dice que el
 *     arreglo es la fecha de recepción de la guía en Ingresos.
 *  2. **La fila de la guía** (I2 es por fila, `WoodEntry`): una troza anotada en
 *     la fila de OTRA especie no se ofrece (el consumo caería en esa fila), ni
 *     las que harían pasar lo que la fila declara. Acomodarlas es un arreglo de
 *     datos en Ingresos, no de este flujo.
 *  3. **Otro permiso**: sólo trozas de guías de ESTE contrato, aunque un lote
 *     «de todos» tenga otras.
 *
 * Las trozas que se proponen alcanzan para lo declarado al 56 % (el techo,
 * `RENDIMIENTO_META`), en dos pasadas: primero cada corrida cubre lo producido.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */

import { fechaIngresoDeTroza, type TrozaConsumible } from "./consumo-trozas";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import type { LoteAserrio } from "./lotes-aserrio";
import { enPatio } from "./patio-por-permiso";
import { repartirEnTanda, type CorridaEnTanda } from "./vincular-en-tanda";
import { TOPE_RENDIMIENTO_PCT, type TrozaAVincular } from "./vincular-produccion";
import type { CorridaDelPermiso } from "./volumen-del-permiso";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
/** Diez litros: la tolerancia del patio, no la del float. */
const TOL_M3 = 0.01;
const vol = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Una fila de guía de ingreso del permiso (`WoodEntry`): de ella cuelga el consumo (I2). */
export interface FilaDeGuia {
  id: string;
  gtf: string;
  especie: string | null;
  m3: number;
  consumidoM3: number;
}

export type MotivoFuera = "otra-fila" | "fila-llena" | "otro-permiso";

/** Una troza del permiso que NO se ofrece, con el porqué. */
export interface TrozaFuera {
  id: string;
  especie: string | null;
  m3: number;
  motivo: MotivoFuera;
  gtf: string | null;
  /** La especie de la fila de la que cuelga (sólo `otra-fila`). */
  especieFila: string | null;
}

/** Un lote abierto de la especie con piezas del permiso que sí se pueden usar. */
export interface LoteDelGrupo {
  id: string;
  code: string;
  piezas: number;
  m3: number;
}

/**
 * Por qué una corrida no se ofrece. `null` = se ofrece.
 *  · `fecha`: ninguna troza de su especie (apta o no) estaba en el patio ese día.
 *  · `sin-trozas`: no hay ninguna troza apta de su especie (las que hay están fuera).
 *  · `se-acabo`: las aptas ya se las llevaron las anteriores.
 *  · `regla`: `revisarVinculacion` dice que no (p. ej. ya tiene origen).
 */
export type FrenoDeCorrida = null | "fecha" | "sin-trozas" | "se-acabo" | "regla";

export interface CorridaDelReparto {
  corrida: CorridaEnTanda;
  frena: FrenoDeCorrida;
  /** El error de la regla que la frena (sólo con `frena: "regla"`). */
  mensaje: string | null;
  trozaM3: number;
  rendimientoPct: number | null;
  /** Rinde más del 56 %: es aviso, se firma igual, pero se ve antes. */
  pasaElTope: boolean;
}

/** Lo que hace falta para vincular las corridas de UNA especie. */
export interface GrupoAVincular {
  clave: string;
  especie: string;
  /** Todas, la más vieja primero. */
  corridas: CorridaEnTanda[];
  /** Las que el reparto puede vincular: las únicas que van a la tanda. */
  ofrecibles: CorridaEnTanda[];
  /** Una por corrida, en el mismo orden. */
  reparto: CorridaDelReparto[];
  declaradoM3: number;
  /** Lo declarado ÷ 56 %: la troza que hace falta para no pasar el techo. */
  necesarioM3: number;
  /** Trozas aptas de esta especie, en el patio y sin lote, en el orden de la sierra. */
  libres: TrozaConsumible[];
  lotes: LoteDelGrupo[];
  /** De dónde sale la madera del reparto: el lote que ya existe, o las libres. */
  origen: "lote" | "libres";
  /** Las trozas del reparto que van a las ofrecibles, en el orden de la sierra. */
  sugeridas: string[];
  sugeridasM3: number;
  /** `true` = todas se ofrecen y cada una llega al 56 %. */
  alcanza: boolean;
  /** Las trozas de esta especie que no se ofrecen. */
  fuera: TrozaFuera[];
  /** La troza más vieja de la especie, apta o no (AAAA-MM-DD): «figuran recibidas el …». */
  trozasDesde: string | null;
}

export type MotivoApartada = "sin-volumen" | "sin-especie";

export interface PlanDescontar {
  grupos: GrupoAVincular[];
  /** Corridas que no entran a ninguna tanda, con el porqué. */
  apartadas: { id: string; lineNo: number | null; especie: string | null; motivo: MotivoApartada }[];
  /** Especies con trozas aptas del permiso y ninguna corrida (p. ej. «Huayruro» vs «Huayruro Negro»). */
  trozasSinCorrida: { especie: string; trozas: number; m3: number }[];
  /** Por troza fuera: el motivo en palabras (lo usa la tanda para sacarla del reparto). */
  motivoFuera: Record<string, string>;
  /** Desde cuándo está cada troza en el patio (AAAA-MM-DD). */
  fechasIngreso: Record<string, string | null>;
}

/** Código legible de una troza: el de planta si lo tiene, si no el del bosque. */
export const codigoDeTroza = (t: { codigoPlanta?: string | null; codificacion?: string | null }) =>
  t.codigoPlanta?.trim() || t.codificacion?.trim() || null;

/**
 * El orden en que la madera entra a la sierra: primero la que llegó antes al
 * patio, y a igual fecha por código. Lo usan el armado Y la tanda: si no
 * ordenaran igual, el lote armado para cinco corridas se repartiría distinto.
 */
export function ordenarTrozas<T extends TrozaConsumible>(trozas: readonly T[]): T[] {
  const fecha = (t: TrozaConsumible) => fechaIngresoDeTroza(t) ?? "9999";
  return [...trozas].sort(
    (a, b) =>
      fecha(a).localeCompare(fecha(b)) ||
      (codigoDeTroza(a) ?? "").localeCompare(codigoDeTroza(b) ?? "", "es-PE", { numeric: true }) ||
      a.id.localeCompare(b.id),
  );
}

/** La troza como la mira la revisión, CON su fecha de ingreso (regla 4). */
export function trozaAVincular(
  t: {
    id: string;
    codigoPlanta?: string | null;
    codificacion?: string | null;
    volumenM3?: number | string | null;
    largoM?: number | string | null;
  },
  fechaIngreso: string | null = null,
  noDisponible: string | null = null,
): TrozaAVincular {
  return {
    id: t.id,
    codigo: codigoDeTroza(t),
    volumenM3: vol(t.volumenM3),
    largoM: t.largoM == null ? null : vol(t.largoM),
    fechaIngreso,
    noDisponible,
  };
}

/** La corrida del permiso como la recibe la tanda. `producidoM3` es su m³ de aserrada. */
export function corridaEnTanda(c: CorridaDelPermiso): CorridaEnTanda {
  return {
    id: c.id,
    lineNo: c.lineNo,
    especie: c.especie,
    producidoM3: c.m3 ?? 0,
    /* Los paquetes no vienen en el volumen: la tanda los pide por corrida. */
    largoMaxPiezaM: null,
    fecha: c.fecha.slice(0, 10),
    tieneMateriaPrima: c.consumidoM3 > 0,
  };
}

/**
 * Qué trozas del permiso se pueden ofrecer, simulando I2 fila por fila.
 *
 * El consumo de una troza se anota en la fila de guía (`WoodEntry`) de la que
 * cuelga, y el tope es por fila: lo declarado menos lo ya consumido. Una troza
 * de Cachimbo colgada de la fila «Copal» anotaría Cachimbo como Copal; una que
 * haga pasar lo declarado haría que el servidor corte la tanda a la mitad.
 */
export function clasificarTrozas(
  trozas: readonly TrozaConsumible[],
  filas: readonly FilaDeGuia[],
): { aptas: TrozaConsumible[]; fuera: TrozaFuera[] } {
  const porFila = new Map(filas.map((f) => [f.id, f]));
  const usado = new Map<string, number>();
  const aptas: TrozaConsumible[] = [];
  const fuera: TrozaFuera[] = [];
  for (const t of ordenarTrozas(trozas)) {
    const f = porFila.get(t.woodEntryId);
    const base = { id: t.id, especie: t.especieComun, m3: vol(t.volumenM3), gtf: t.gtfNumber ?? f?.gtf ?? null };
    if (!f) {
      fuera.push({ ...base, motivo: "otro-permiso", especieFila: null });
      continue;
    }
    const claveFila = claveEspecie(f.especie);
    if (claveFila && claveFila !== claveEspecie(t.especieComun)) {
      fuera.push({ ...base, motivo: "otra-fila", especieFila: f.especie });
      continue;
    }
    const tope = r4(f.m3 - f.consumidoM3);
    const llevaria = r4((usado.get(f.id) ?? 0) + base.m3);
    if (llevaria > tope) {
      fuera.push({ ...base, motivo: "fila-llena", especieFila: f.especie });
      continue;
    }
    usado.set(f.id, llevaria);
    aptas.push(t);
  }
  return { aptas, fuera };
}

/**
 * El reparto de UNA especie sobre un conjunto de trozas, corrida por corrida.
 *
 * `contexto` es lo que el conjunto no sabe de la especie entera: desde cuándo
 * hay troza de esa especie en el patio (apta o no) y si hay alguna apta. Sin
 * esto, una selección vacía decía «no hay trozas» cuando las había, y una
 * corrida anterior a toda la madera no decía que el problema es la fecha.
 */
export function repartoDelGrupo(
  corridas: readonly CorridaEnTanda[],
  especie: string,
  pool: readonly TrozaConsumible[],
  meta: number = RENDIMIENTO_META,
  contexto: { desde: string | null; hayAptas: boolean } = { desde: null, hayAptas: pool.length > 0 },
): { reparto: CorridaDelReparto[]; sugeridas: string[] } {
  const r = repartirEnTanda(
    corridas,
    { code: "", especie, status: "abierto" },
    pool.map((t) => trozaAVincular(t, fechaIngresoDeTroza(t))),
    { rendimientoMeta: meta },
  );
  const reparto: CorridaDelReparto[] = r.filas.map((f) => {
    const error = f.revision.hallazgos.find((h) => h.severidad === "error");
    const antesDeToda = contexto.desde != null && f.corrida.fecha.slice(0, 10) < contexto.desde;
    const frena: FrenoDeCorrida = !f.alcanzo
      ? antesDeToda
        ? "fecha"
        : !contexto.hayAptas
          ? "sin-trozas"
          : pool.length === 0
            ? "se-acabo"
            : (f.sinMadera ?? "se-acabo")
      : error
        ? "regla"
        : null;
    return {
      corrida: f.corrida,
      frena,
      mensaje: frena === "regla" ? (error?.mensaje ?? null) : null,
      trozaM3: f.revision.trozaM3,
      rendimientoPct: f.revision.rendimientoPct,
      pasaElTope: frena == null && f.revision.rendimientoPct != null && f.revision.rendimientoPct > TOPE_RENDIMIENTO_PCT,
    };
  });
  const enUso = new Set(r.filas.filter((_, k) => reparto[k]!.frena == null).flatMap((f) => f.trozas.map((t) => t.id)));
  return { reparto, sugeridas: pool.filter((t) => enUso.has(t.id)).map((t) => t.id) };
}

/**
 * Arma el plan por especie.
 *
 * @param corridas las del aviso (`avisos.corridasSinMateriaPrima.ids`) o UNA.
 * @param trozas el patio acotado al permiso (`/trozas/patio?contratoId=`).
 * @param lotes los lotes del tenant, con sus piezas.
 * @param filas las guías del permiso (`volumen.guias`): especie y tope de cada fila.
 */
export function planDescontar(
  corridas: readonly CorridaDelPermiso[],
  trozas: readonly TrozaConsumible[],
  lotes: readonly LoteAserrio[],
  filas: readonly FilaDeGuia[],
  meta: number = RENDIMIENTO_META,
): PlanDescontar {
  const apartadas: PlanDescontar["apartadas"] = [];
  const porClave = new Map<string, CorridaDelPermiso[]>();
  for (const c of corridas) {
    if (!(c.m3 != null && c.m3 > 0)) {
      apartadas.push({ id: c.id, lineNo: c.lineNo, especie: c.especie, motivo: "sin-volumen" });
      continue;
    }
    const clave = claveEspecie(c.especie);
    if (!clave) {
      apartadas.push({ id: c.id, lineNo: c.lineNo, especie: c.especie, motivo: "sin-especie" });
      continue;
    }
    porClave.set(clave, [...(porClave.get(clave) ?? []), c]);
  }

  /* Lo que está EN el patio (ADR-431); lo por recepcionar no va a la sierra. */
  const { aptas, fuera } = clasificarTrozas(trozas.filter(enPatio), filas);
  const lotePorId = new Map(lotes.map((l) => [l.id, l]));

  const grupos: GrupoAVincular[] = [...porClave.entries()].map(([clave, cs]) => {
    const especie = cs[0]!.especie?.trim() || clave;
    const enTanda = cs
      .map(corridaEnTanda)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.lineNo ?? 0) - (b.lineNo ?? 0));
    const deEspecie = aptas.filter((t) => claveEspecie(t.especieComun) === clave);
    const libres = deEspecie.filter((t) => !t.loteAserrioId);
    const lotesDelGrupo = [...new Set(deEspecie.map((t) => t.loteAserrioId).filter((id): id is string => !!id))]
      .map((id) => lotePorId.get(id))
      .filter((l): l is LoteAserrio => !!l && l.status === "abierto" && claveEspecie(l.speciesCommon) === clave)
      .map((l) => {
        const p = deEspecie.filter((t) => t.loteAserrioId === l.id && !t.consumidaEnId);
        return { id: l.id, code: l.code, piezas: p.length, m3: r4(p.reduce((a, t) => a + vol(t.volumenM3), 0)) };
      })
      .filter((l) => l.piezas > 0);
    const lote = lotesDelGrupo[0] ?? null;
    const pool = lote ? deEspecie.filter((t) => t.loteAserrioId === lote.id) : libres;
    const fueraDeEspecie = fuera.filter((t) => claveEspecie(t.especie) === clave);
    /* La fecha se mira contra TODAS las trozas de la especie, también las que
       están fuera por su fila: arreglar la fila no alcanza si además la guía
       figura recibida después — se dicen los dos arreglos de una vez. */
    const fechas = [...deEspecie, ...trozas.filter((t) => fueraDeEspecie.some((f) => f.id === t.id))]
      .map(fechaIngresoDeTroza)
      .filter((f): f is string => !!f)
      .sort();
    const desde = fechas[0] ?? null;
    const { reparto, sugeridas } = repartoDelGrupo(enTanda, especie, pool, meta, {
      desde,
      hayAptas: deEspecie.length > 0,
    });
    const declaradoM3 = r4(enTanda.reduce((a, c) => a + c.producidoM3, 0));
    return {
      clave,
      especie,
      corridas: enTanda,
      ofrecibles: reparto.filter((r) => r.frena == null).map((r) => r.corrida),
      reparto,
      declaradoM3,
      necesarioM3: r4(declaradoM3 / meta),
      libres,
      lotes: lotesDelGrupo,
      origen: lote ? "lote" : "libres",
      sugeridas,
      sugeridasM3: r4(pool.filter((t) => sugeridas.includes(t.id)).reduce((a, t) => a + vol(t.volumenM3), 0)),
      alcanza:
        reparto.length > 0 &&
        reparto.every((r) => r.frena == null && r.trozaM3 + TOL_M3 >= r.corrida.producidoM3 / meta),
      fuera: fueraDeEspecie,
      trozasDesde: desde,
    };
  });

  /* Primero lo que se puede hacer hoy, después por volumen declarado. */
  const accionable = (g: GrupoAVincular) => (g.ofrecibles.length > 0 ? 0 : 1);
  grupos.sort(
    (a, b) => accionable(a) - accionable(b) || b.declaradoM3 - a.declaradoM3 || a.especie.localeCompare(b.especie),
  );

  const sinCorrida = new Map<string, { especie: string; trozas: number; m3: number }>();
  for (const t of aptas) {
    const clave = claveEspecie(t.especieComun);
    if (!clave || porClave.has(clave) || t.loteAserrioId) continue;
    const prev = sinCorrida.get(clave) ?? { especie: t.especieComun?.trim() || clave, trozas: 0, m3: 0 };
    prev.trozas += 1;
    prev.m3 = r4(prev.m3 + vol(t.volumenM3));
    sinCorrida.set(clave, prev);
  }

  const motivoFuera: Record<string, string> = {};
  for (const t of fuera) motivoFuera[t.id] = textoDeMotivo(t);
  /* Del permiso pero FUERA del patio (por recepcionar, ya salió, descarte, madre
     retrozada): si ya está en un lote, la tanda no puede ofrecerla — el servidor
     la sacaría sin avisar y el mensaje diría más m³ descontados de los reales. */
  for (const t of trozas) {
    if (!t.consumidaEnId && !enPatio(t) && !(t.id in motivoFuera)) {
      motivoFuera[t.id] = "no está en el patio (por recepcionar, ya salió o no se puede aserrar)";
    }
  }
  const fechasIngreso: Record<string, string | null> = {};
  for (const t of trozas) fechasIngreso[t.id] = fechaIngresoDeTroza(t);

  return {
    grupos,
    apartadas,
    trozasSinCorrida: [...sinCorrida.values()].sort((a, b) => b.m3 - a.m3),
    motivoFuera,
    fechasIngreso,
  };
}

/** El motivo de una troza fuera, en palabras (lo muestra la revisión si alguien la elige igual). */
export function textoDeMotivo(t: TrozaFuera): string {
  if (t.motivo === "otra-fila") return `está anotada en la fila de ${t.especieFila ?? "otra especie"} de su guía`;
  if (t.motivo === "fila-llena") return `pasaría lo que declara la fila de su guía${t.gtf ? ` (GTF ${t.gtf})` : ""}`;
  return "es de otro permiso";
}

/**
 * Las piezas de un lote que la tanda NO debe usar, con su motivo: las que están
 * fuera por fila o por I2, y las de OTRO permiso que un lote «de todos» trae.
 */
export function bloqueadasDelLote(
  lote: Pick<LoteAserrio, "trozas">,
  plan: Pick<PlanDescontar, "motivoFuera" | "fechasIngreso">,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of lote.trozas) {
    if (t.consumidaEnId) continue;
    const m = plan.motivoFuera[t.id] ?? (t.id in plan.fechasIngreso ? null : "es de otro permiso");
    if (m) out[t.id] = m;
  }
  return out;
}

/** El orden de la sierra para UNA especie: todas las trozas del permiso de esa especie. */
export function ordenDeEspecie(trozas: readonly TrozaConsumible[], clave: string): string[] {
  return ordenarTrozas(trozas.filter((t) => claveEspecie(t.especieComun) === clave)).map((t) => t.id);
}

/** La nota del lote armado desde la ficha: de dónde salió, para que dentro de un año se entienda. */
export function notaDelLoteDelPermiso(
  codigoPermiso: string,
  g: Pick<GrupoAVincular, "ofrecibles">,
  trozas: number,
  m3: number,
): string {
  const nums = g.ofrecibles.map((c) => (c.lineNo == null ? "—" : String(c.lineNo)));
  return (
    `Armado desde la ficha del permiso ${codigoPermiso} para ${g.ofrecibles.length} ` +
    `corrida${g.ofrecibles.length === 1 ? "" : "s"} sin materia prima (N° ${nums.join(", ")}) · ` +
    `${trozas} troza${trozas === 1 ? "" : "s"} · ${r4(m3)} m³`
  ).slice(0, 500);
}

/** El permiso que declaran las trozas elegidas: uno solo, o `null` si no dicen o mezclan. */
export function permisoDeTrozas(trozas: readonly Pick<TrozaConsumible, "permiso">[]): string | null {
  const ps = [...new Set(trozas.map((t) => t.permiso?.trim()).filter((p): p is string => !!p))];
  return ps.length === 1 ? ps[0]! : null;
}
