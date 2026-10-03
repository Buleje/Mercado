/**
 * volumen-disponible — cuánta madera hay para trabajar, sumando las cuatro
 * pilas del libro en una sola cifra (pestaña «Volumen disponible», Brandon
 * 2026-10-03).
 *
 * «Unificá Trozas y Productos disponibles en una pestaña; agregá el volumen de
 * los lotes (lo que les sobra) y el de los ingresos por recepcionar; y una
 * opción que sume todo para saber cuánto se puede aprovechar.»
 *
 * LAS CUATRO PILAS NO SE PISAN: cada m³ cae en UNA sola, o la suma de «Todo»
 * contaría dos veces la misma troza.
 *  · trozas     — recibida, sin lote: puede ir hoy a la sierra;
 *  · lotes      — el SOBRANTE de cada lote, el mismo que «Lotes de aserrío»
 *                 (`sobraDeLote`): en el abierto (y el mixto), sus trozas sin
 *                 aserrar; en el ya aserrado, lo que todavía se puede declarar
 *                 bajo el tope del 56 % (su «Volumen sobrante»). Brandon
 *                 03-10: «en lotes hay volumen sobrante pero pones que no hay
 *                 nada» — la primera versión sólo contaba las trozas;
 *  · recepcion  — anotada, con la guía todavía en la bandeja;
 *  · productos  — madera aserrada con saldo (libre + apartada). Lo marcado
 *                 usado NO entra: ya no está para trabajar.
 *
 * Los m³ se suman tal como están (troza y aserrada juntas, que es lo que se
 * pidió). El pt «aprovechable» es un DERIVADO y se dice que lo es: la troza al
 * 56 % aserrable (`ptDe` de trozas) y lo aserrado —también lo por declarar,
 * que ya es m³ de producto— a m³ × 424. Por eso cada partida dice su clase.
 *
 * PURO y client-safe.
 */

import type { HojaExcel } from "@/lib/export-excel";
import { estaDisponible, type TrozaConsumible } from "./consumo-trozas";
import { grafiaPreferida } from "./especies-catalogo";
import { claveEspecie } from "./loth-constants";
import {
  ESTADO_LOTE,
  TOLERANCIA_CUADRE_SNIFFS_M3,
  diasDeEspera,
  etiquetaDeSobra,
  margenLote,
  permisosDelLote,
  sobraDeLote,
  type LoteAserrio,
} from "./lotes-aserrio";
import { ptDe as ptRolliza } from "./trozas-disponibles";
import {
  clavePermiso,
  ptDe as ptAserrada,
  type FilaProducto,
} from "./productos-disponibles-resumen";
import type { CorridaAMedioDeclarar } from "./produccion-paquetes";

export type FuenteVolumen = "trozas" | "productos" | "lotes" | "recepcion";
/** En qué se mira el volumen: m³ tal como está o pt aprovechables (derivado). */
export type UnidadVolumen = "m3" | "pt";
/** El orden de los chips y de las columnas: el del patio a la venta. */
export const FUENTES_VOLUMEN: readonly FuenteVolumen[] = ["trozas", "lotes", "recepcion", "productos"];
export const ETIQUETA_FUENTE: Record<FuenteVolumen, string> = {
  trozas: "Trozas",
  productos: "Productos",
  lotes: "Lotes",
  recepcion: "Por recepcionar",
};
/** Qué es cada pila, en corto (subtexto del chip y de la tarjeta). */
export const DETALLE_FUENTE: Record<FuenteVolumen, string> = {
  trozas: "libres en el patio",
  productos: "madera aserrada",
  lotes: "sobrante: sin aserrar y por declarar",
  recepcion: "guías sin recepcionar",
};
/** Cómo se cuenta cada pila: trozas, paquetes, lotes o guías. */
export const UNIDAD_FUENTE: Record<FuenteVolumen, [string, string]> = {
  trozas: ["troza", "trozas"],
  productos: ["paquete", "paquetes"],
  lotes: ["lote", "lotes"],
  recepcion: ["guía", "guías"],
};

export const SIN_PERMISO = "Sin permiso";
export const SIN_ESPECIE = "Sin especie";
/** Separador de una corrida con madera de dos permisos (el mismo de Productos). */
const SEP_PERMISOS = " · ";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: string | null | undefined) => (v ?? "").trim();

/** El pt aprovechable de un volumen partido en rolliza y aserrada. */
export const ptAprovechable = (m3Rolliza: number, m3Aserrada: number) =>
  ptRolliza(m3Rolliza) + ptAserrada(m3Aserrada);

// ── Partidas: lo mínimo que comparten las cuatro pilas ──────────────────────

export interface PartidaVolumen {
  fuente: FuenteVolumen;
  /** `clavePermiso` («» = no lo declara); una corrida con dos: «A · B». */
  permisoClave: string;
  /** Cómo está escrito en el libro. */
  permiso: string;
  especieClave: string;
  especie: string;
  m3: number;
  /** Troza (pt al 56 %) o madera aserrada / por declarar (pt = m³ × 424). */
  rolliza: boolean;
  /**
   * Lo que se cuenta en `UNIDAD_FUENTE`: la troza, el paquete, el lote o la
   * guía. `null` = suma m³ pero no se cuenta (la corrida sin paquetes: Productos
   * disponibles dice «5 paquetes» y no 6 por ella).
   */
  unidad: string | null;
}

/** A qué pila va una troza viva. `null` = no está disponible (consumida, bloqueada). */
export function fuenteDeTroza(t: TrozaConsumible): Exclude<FuenteVolumen, "productos"> | null {
  if (!estaDisponible(t)) return null;
  if (t.guiaRecepcionada === false) return "recepcion";
  /* El mixto también es un lote: sus trozas están apartadas y no van a la
     sierra sin repartirse (LM4). Contarlas como libres las pondría dos veces. */
  return t.loteAserrioId || t.loteMixtoId ? "lotes" : "trozas";
}

export function partidasDeTrozas(trozas: readonly TrozaConsumible[]): PartidaVolumen[] {
  const out: PartidaVolumen[] = [];
  for (const t of trozas) {
    const fuente = fuenteDeTroza(t);
    if (!fuente) continue;
    out.push({
      fuente,
      permisoClave: clavePermiso(t.permiso),
      permiso: texto(t.permiso),
      especieClave: claveEspecie(t.especieComun),
      especie: texto(t.especieComun),
      m3: num(t.volumenM3),
      rolliza: true,
      unidad:
        fuente === "lotes"
          ? `lote:${t.loteAserrioId ?? `mixto:${t.loteMixtoId}`}`
          : fuente === "recepcion"
            ? `guia:${t.woodEntryId}`
            : `troza:${t.id}`,
    });
  }
  return out;
}

/** Lo aserrado con saldo. El m³ es el del LIBRO repartido, igual que Productos disponibles. */
export function partidasDeProductos(filas: readonly FilaProducto[]): PartidaVolumen[] {
  return filas
    .filter((f) => f.estado !== "usado")
    .map((f) => ({
      fuente: "productos" as const,
      permisoClave: f.permisoClave,
      permiso: [...new Set((f.corrida.titularOrigen ?? []).map(texto).filter(Boolean))].join(SEP_PERMISOS),
      especieClave: f.especieClave,
      especie: texto(f.corrida.especie),
      m3: f.m3Libro,
      rolliza: false,
      unidad: f.paquete ? f.clave : null,
    }));
}

/** Lo que todavía se puede declarar de un lote ya aserrado. `null` = nada (o está abierto). */
function porDeclarar(l: LoteAserrio): CorridaAMedioDeclarar | null {
  if (l.status === "abierto") return null;
  const m = margenLote(l);
  return m && m.margenM3 > TOLERANCIA_CUADRE_SNIFFS_M3 ? m : null;
}
const permisoDeLote = (l: LoteAserrio) => {
  const escritos = permisosDelLote(l).length ? permisosDelLote(l) : texto(l.permiso) ? [texto(l.permiso)] : [];
  return {
    clave: [...new Set(escritos.map(clavePermiso).filter(Boolean))].sort().join(SEP_PERMISOS),
    escrito: [...new Set(escritos)].sort().join(SEP_PERMISOS),
  };
};

/**
 * El sobrante de los lotes YA ASERRADOS: lo declarable bajo el tope (la misma
 * cuenta que «Volumen sobrante» de Lotes de aserrío). Lo de los abiertos sale
 * del patio (`partidasDeTrozas`): así la troza no puede caer en dos pilas.
 */
export function partidasDeLotes(lotes: readonly LoteAserrio[]): PartidaVolumen[] {
  const out: PartidaVolumen[] = [];
  for (const l of lotes) {
    const m = porDeclarar(l);
    if (!m) continue;
    const permiso = permisoDeLote(l);
    out.push({
      fuente: "lotes",
      permisoClave: permiso.clave,
      permiso: permiso.escrito,
      especieClave: claveEspecie(l.speciesCommon),
      especie: texto(l.speciesCommon),
      m3: r4(m.margenM3),
      rolliza: false,
      unidad: `lote:${l.id}`,
    });
  }
  return out;
}

// ── Filtro por permiso y por especie ─────────────────────────────────────────

/** Los permisos de una clave: una corrida con madera de dos entra por cualquiera. */
export const partesDePermiso = (clave: string): string[] =>
  clave.split(SEP_PERMISOS).map((p) => p.trim()).filter(Boolean);

/** ¿Entra por permiso? `elegidos` vacío = todos; «» elige lo que no declara permiso. */
export function entraPorPermiso(permisoClave: string, elegidos: readonly string[]): boolean {
  if (elegidos.length === 0) return true;
  const partes = partesDePermiso(permisoClave);
  return partes.length === 0 ? elegidos.includes("") : partes.some((p) => elegidos.includes(p));
}

/** ¿Entra por especie? `elegidas` vacío = todas; «» elige lo que no la declara. */
export const entraPorEspecie = (especieClave: string, elegidas: readonly string[]): boolean =>
  elegidas.length === 0 || elegidas.includes(especieClave);

export interface OpcionPermiso {
  clave: string;
  etiqueta: string;
  m3: number;
}

/** Las especies para elegir, con su peso en m³ (la del lote o la troza, la de la corrida). */
export function opcionesDeEspecie(partidas: readonly PartidaVolumen[]): OpcionPermiso[] {
  return volumenPorGrupo(partidas, "especie").map((g) => ({ clave: g.clave, etiqueta: g.etiqueta, m3: g.m3 }));
}

/**
 * Las opciones de un filtro, sin perder las ya elegidas: si lo elegido se quedó
 * sin madera (se despachó, o el otro filtro lo dejó afuera) igual tiene su chip
 * en 0, para poder soltarlo.
 */
export function conLasElegidas(
  opciones: readonly OpcionPermiso[],
  elegidas: readonly string[],
  etiquetas: ReadonlyMap<string, string>,
  sinNombre: string,
): OpcionPermiso[] {
  const faltan = elegidas
    .filter((k) => !opciones.some((o) => o.clave === k))
    .map((k) => ({ clave: k, etiqueta: k ? (etiquetas.get(k) ?? k) : sinNombre, m3: 0 }));
  return [...opciones, ...faltan];
}

/** Los permisos para elegir, de TODAS las pilas y con su peso (sin achicarse con el filtro). */
export function opcionesDePermiso(partidas: readonly PartidaVolumen[]): OpcionPermiso[] {
  const acc = new Map<string, { m3: number; grafias: Map<string, number> }>();
  for (const p of partidas) {
    const claves = partesDePermiso(p.permisoClave);
    const escritos = p.permiso.split(SEP_PERMISOS).map(texto);
    (claves.length ? claves : [""]).forEach((k, i) => {
      const a = acc.get(k) ?? { m3: 0, grafias: new Map<string, number>() };
      /* Una corrida de dos permisos pesa en los dos: es la madera que entra
         al elegir cualquiera de ellos. */
      a.m3 += p.m3;
      const g = escritos[i] || k;
      if (g) a.grafias.set(g, (a.grafias.get(g) ?? 0) + 1);
      acc.set(k, a);
    });
  }
  return [...acc.entries()]
    .map(([clave, a]) => ({
      clave,
      etiqueta: clave
        ? grafiaPreferida([...a.grafias.entries()].map(([texto, usos]) => ({ texto, usos })))
        : SIN_PERMISO,
      m3: r4(a.m3),
    }))
    .sort((a, b) => (a.clave === "" ? 1 : b.clave === "" ? -1 : b.m3 - a.m3));
}

// ── Resumen y grupos ─────────────────────────────────────────────────────────

export interface VolumenDeFuente {
  m3: number;
  pt: number;
  unidades: number;
}

export interface ResumenVolumen {
  porFuente: Record<FuenteVolumen, VolumenDeFuente>;
  total: { m3: number; pt: number };
  /** Permisos con nombre entre las partidas (una corrida de dos cuenta los dos). */
  permisos: number;
}

const cero = (): Record<FuenteVolumen, number> => ({ trozas: 0, productos: 0, lotes: 0, recepcion: 0 });

/** m³ por pila, partidos en troza y aserrada: el pt se calcula por clase, no por pila. */
interface Reparto {
  rolliza: Record<FuenteVolumen, number>;
  aserrada: Record<FuenteVolumen, number>;
}
const repartoVacio = (): Reparto => ({ rolliza: cero(), aserrada: cero() });
const sumar = (r: Reparto, p: PartidaVolumen) => {
  (p.rolliza ? r.rolliza : r.aserrada)[p.fuente] += p.m3;
};
const m3De = (r: Reparto, f: FuenteVolumen) => r.rolliza[f] + r.aserrada[f];
const sumaDe = (x: Record<FuenteVolumen, number>) => FUENTES_VOLUMEN.reduce((a, f) => a + x[f], 0);
/* El pt de un total es la SUMA de los pt de cada pila, ya redondeados: si se
   recalculara de los m³ juntos, «3 209 + 2 268 + 2 962» daría 8 440 arriba y
   8 439 a mano (medido 03-10). Un pt de diferencia no vale una suma que no cierra. */
const ptDePila = (r: Reparto, f: FuenteVolumen) => ptAprovechable(r.rolliza[f], r.aserrada[f]);
const ptDeReparto = (r: Reparto) => FUENTES_VOLUMEN.reduce((a, f) => a + ptDePila(r, f), 0);

export function resumenVolumen(partidas: readonly PartidaVolumen[]): ResumenVolumen {
  const r = repartoVacio();
  const unidades = new Map<FuenteVolumen, Set<string>>(FUENTES_VOLUMEN.map((f) => [f, new Set()]));
  const permisos = new Set<string>();
  for (const p of partidas) {
    sumar(r, p);
    if (p.unidad) unidades.get(p.fuente)?.add(p.unidad);
    for (const k of partesDePermiso(p.permisoClave)) permisos.add(k);
  }
  const porFuente = Object.fromEntries(
    FUENTES_VOLUMEN.map((f) => [
      f,
      {
        m3: r4(m3De(r, f)),
        pt: ptDePila(r, f),
        unidades: unidades.get(f)?.size ?? 0,
      },
    ]),
  ) as Record<FuenteVolumen, VolumenDeFuente>;
  return {
    porFuente,
    total: { m3: r4(sumaDe(r.rolliza) + sumaDe(r.aserrada)), pt: ptDeReparto(r) },
    permisos: permisos.size,
  };
}

export type DimensionVolumen = "permiso" | "especie";

export interface FilaVolumen {
  clave: string;
  etiqueta: string;
  porFuente: Record<FuenteVolumen, number>;
  /** El pt aprovechable de cada pila en este grupo (para ver la tabla en pt). */
  ptPorFuente: Record<FuenteVolumen, number>;
  m3: number;
  pt: number;
  /** Cuánto del m³ de la tabla es de este grupo (0-100, un decimal). */
  pct: number;
}

/**
 * La tabla combinada: una fila por permiso o por especie, una columna por pila.
 * Ordenada por m³; «Sin …» siempre al final (es un pendiente, no un origen).
 */
export function volumenPorGrupo(
  partidas: readonly PartidaVolumen[],
  dim: DimensionVolumen,
): FilaVolumen[] {
  const acc = new Map<string, { r: Reparto; grafias: Map<string, number> }>();
  for (const p of partidas) {
    const k = dim === "permiso" ? p.permisoClave : p.especieClave;
    const a = acc.get(k) ?? { r: repartoVacio(), grafias: new Map<string, number>() };
    sumar(a.r, p);
    const g = dim === "permiso" ? p.permiso : p.especie;
    if (g) a.grafias.set(g, (a.grafias.get(g) ?? 0) + 1);
    acc.set(k, a);
  }
  const total = partidas.reduce((a, p) => a + p.m3, 0);
  const sin = dim === "permiso" ? SIN_PERMISO : SIN_ESPECIE;
  return [...acc.entries()]
    .map(([clave, a]) => {
      const m3 = FUENTES_VOLUMEN.reduce((s, f) => s + m3De(a.r, f), 0);
      return {
        clave,
        etiqueta: clave
          ? grafiaPreferida([...a.grafias.entries()].map(([texto, usos]) => ({ texto, usos }))) || clave
          : sin,
        porFuente: Object.fromEntries(FUENTES_VOLUMEN.map((f) => [f, r4(m3De(a.r, f))])) as Record<FuenteVolumen, number>,
        ptPorFuente: Object.fromEntries(FUENTES_VOLUMEN.map((f) => [f, ptDePila(a.r, f)])) as Record<FuenteVolumen, number>,
        m3: r4(m3),
        pt: ptDeReparto(a.r),
        pct: total > 0 ? Math.round((m3 / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => (a.clave === "" ? 1 : b.clave === "" ? -1 : b.m3 - a.m3));
}

// ── El detalle de las dos pilas nuevas ───────────────────────────────────────

export interface FilaLoteSobrante {
  /** id del lote de aserrío, o `mixto:<id>`. */
  id: string;
  codigo: string;
  esMixto: boolean;
  /** «Abierto», «Aserrado»… o «Mixto». `null` = el listado de lotes no lo trajo. */
  estado: string | null;
  especie: string;
  permisos: string[];
  /** Sus trozas vivas, sin aserrar (lote abierto o mixto). */
  trozas: number;
  m3SinAserrar: number;
  /** Lo que todavía se puede declarar bajo el tope del 56 % (lote ya aserrado). */
  m3PorDeclarar: number;
  /** El sobrante: sin aserrar + por declarar. Es lo que suma la pila. */
  m3: number;
  pt: number;
  /** Cómo lo lee «Lotes de aserrío»: «Queda poco · 12 %», «Cupo corto · 10.4 %»… */
  nivel: string | null;
  /** Madera aserrada del lote que sigue disponible. YA cuenta en Productos: no suma acá. */
  m3Aserrada: number | null;
  diasAbierto: number | null;
}

/**
 * El sobrante de cada lote, como lo lee «Lotes de aserrío». `entra` aplica los
 * filtros de arriba (permiso y especie) con las mismas claves que las partidas.
 */
export function lotesConSobrante(
  trozas: readonly TrozaConsumible[],
  lotes: readonly LoteAserrio[],
  ahora: Date,
  entra: (permisoClave: string, especieClave: string) => boolean = () => true,
): FilaLoteSobrante[] {
  const porId = new Map(lotes.map((l) => [l.id, l]));
  type Acc = { t: TrozaConsumible | null; lote: LoteAserrio | null; trozas: number; m3: number; porDeclarar: number; especies: Map<string, number>; permisos: Set<string> };
  const acc = new Map<string, Acc>();
  const nuevo = (t: TrozaConsumible | null, lote: LoteAserrio | null): Acc => ({ t, lote, trozas: 0, m3: 0, porDeclarar: 0, especies: new Map(), permisos: new Set() });
  for (const t of trozas) {
    if (fuenteDeTroza(t) !== "lotes") continue;
    if (!entra(clavePermiso(t.permiso), claveEspecie(t.especieComun))) continue;
    const id = t.loteAserrioId ?? `mixto:${t.loteMixtoId}`;
    const a = acc.get(id) ?? nuevo(t, t.loteAserrioId ? (porId.get(t.loteAserrioId) ?? null) : null);
    a.trozas += 1;
    a.m3 += num(t.volumenM3);
    const esp = texto(t.especieComun);
    if (esp) a.especies.set(esp, (a.especies.get(esp) ?? 0) + 1);
    if (texto(t.permiso)) a.permisos.add(texto(t.permiso));
    acc.set(id, a);
  }
  for (const l of lotes) {
    const m = porDeclarar(l);
    if (!m) continue;
    const permiso = permisoDeLote(l);
    if (!entra(permiso.clave, claveEspecie(l.speciesCommon))) continue;
    const a = acc.get(l.id) ?? nuevo(null, l);
    a.porDeclarar += m.margenM3;
    for (const p of permisosDelLote(l)) a.permisos.add(p);
    acc.set(l.id, a);
  }
  return [...acc.entries()]
    .map(([id, a]) => {
      const lote = a.lote;
      const esMixto = !lote && !a.t?.loteAserrioId;
      const m3SinAserrar = r4(a.m3);
      const m3PorDeclarar = r4(a.porDeclarar);
      const especies = [...a.especies.entries()].sort((x, y) => y[1] - x[1]).map(([e]) => e);
      return {
        id,
        codigo: (esMixto ? a.t?.loteMixtoCode : (lote?.code ?? a.t?.loteAserrioCode)) || "Sin código",
        esMixto,
        estado: esMixto ? "Mixto" : lote ? (ESTADO_LOTE[lote.status]?.label ?? lote.status) : null,
        especie: esMixto ? especies.join(", ") || SIN_ESPECIE : texto(lote?.speciesCommon) || especies[0] || SIN_ESPECIE,
        permisos: [...a.permisos].sort(),
        trozas: a.trozas,
        m3SinAserrar,
        m3PorDeclarar,
        m3: r4(m3SinAserrar + m3PorDeclarar),
        pt: ptAprovechable(m3SinAserrar, m3PorDeclarar),
        nivel: lote ? etiquetaDeSobra(sobraDeLote(lote)).texto : null,
        m3Aserrada: lote?.madera && lote.madera.m3Disponible > 0 ? r4(lote.madera.m3Disponible) : null,
        diasAbierto: lote ? diasDeEspera(lote, ahora) : null,
      };
    })
    .sort((a, b) => b.m3 - a.m3);
}

export interface FilaGuiaPorRecepcionar {
  woodEntryId: string;
  guia: string;
  proveedor: string;
  permiso: string;
  especies: string[];
  trozas: number;
  m3: number;
  pt: number;
  /** La fecha del asiento: lo único que tiene hasta que se recepcione (ADR-431, C7). */
  fechaIngreso: string | null;
  diasEsperando: number | null;
}

/**
 * Las guías que esperan recepción, con sus trozas anotadas. Una guía sin
 * ninguna troza anotada no aparece: su volumen vive en el asiento, no en el
 * patio (el 2026-10-03 no había ninguna, ni en main ni en Blas).
 */
export function guiasPorRecepcionar(
  trozas: readonly TrozaConsumible[],
  ahora: Date,
  entra: (permisoClave: string, especieClave: string) => boolean = () => true,
): FilaGuiaPorRecepcionar[] {
  const acc = new Map<string, { t: TrozaConsumible; trozas: number; m3: number; especies: Map<string, number> }>();
  for (const t of trozas) {
    if (fuenteDeTroza(t) !== "recepcion") continue;
    if (!entra(clavePermiso(t.permiso), claveEspecie(t.especieComun))) continue;
    const a = acc.get(t.woodEntryId) ?? { t, trozas: 0, m3: 0, especies: new Map<string, number>() };
    a.trozas += 1;
    a.m3 += num(t.volumenM3);
    const esp = texto(t.especieComun);
    if (esp) a.especies.set(esp, (a.especies.get(esp) ?? 0) + 1);
    acc.set(t.woodEntryId, a);
  }
  return [...acc.entries()]
    .map(([woodEntryId, a]) => {
      const f = a.t.fechaIngreso ? new Date(a.t.fechaIngreso) : null;
      const valida = f && !Number.isNaN(f.getTime()) ? f : null;
      const m3 = r4(a.m3);
      return {
        woodEntryId,
        guia: texto(a.t.gtfNumber) || "Sin N° de guía",
        proveedor: texto(a.t.proveedor),
        permiso: texto(a.t.permiso),
        especies: [...a.especies.entries()].sort((x, y) => y[1] - x[1]).map(([e]) => e),
        trozas: a.trozas,
        m3,
        pt: ptRolliza(m3),
        fechaIngreso: valida ? valida.toISOString() : null,
        diasEsperando: valida ? Math.max(0, Math.floor((ahora.getTime() - valida.getTime()) / 86_400_000)) : null,
      };
    })
    .sort((a, b) => (b.diasEsperando ?? -1) - (a.diasEsperando ?? -1) || b.m3 - a.m3);
}

// ── Qué pilas se miran ───────────────────────────────────────────────────────

export const TODAS_LAS_FUENTES: readonly FuenteVolumen[] = FUENTES_VOLUMEN;
const esFuente = (v: string): v is FuenteVolumen => (FUENTES_VOLUMEN as readonly string[]).includes(v);
export const sonTodas = (f: readonly FuenteVolumen[]) => FUENTES_VOLUMEN.every((x) => f.includes(x));

/** `?fuentes=trozas,productos` o `todo`. `null` = no dice nada válido. */
export function leerFuentes(valor: string | null | undefined): FuenteVolumen[] | null {
  const v = texto(valor).toLowerCase();
  if (!v) return null;
  if (v === "todo") return [...FUENTES_VOLUMEN];
  const elegidas = new Set(v.split(",").map((x) => x.trim()).filter(esFuente));
  return elegidas.size ? FUENTES_VOLUMEN.filter((f) => elegidas.has(f)) : null;
}

export const escribirFuentes = (f: readonly FuenteVolumen[]): string =>
  sonTodas(f) ? "todo" : FUENTES_VOLUMEN.filter((x) => f.includes(x)).join(",");

/**
 * Clic en un chip. Desde «Todo», un chip CAMBIA a esa pila sola (es lo que se
 * quiere al tocarlo); con algunas elegidas, suma o saca; sin ninguna, vuelve a
 * «Todo» (una pantalla sin pilas no contesta nada).
 */
export function alternarFuente(
  actuales: readonly FuenteVolumen[],
  pedida: FuenteVolumen | "todo",
): FuenteVolumen[] {
  if (pedida === "todo") return [...FUENTES_VOLUMEN];
  if (sonTodas(actuales)) return [pedida];
  const siguen = actuales.includes(pedida)
    ? actuales.filter((f) => f !== pedida)
    : [...actuales, pedida];
  return siguen.length ? FUENTES_VOLUMEN.filter((f) => siguen.includes(f)) : [...FUENTES_VOLUMEN];
}

/** Lo que pide quien llega desde otra pantalla; el contador repite el mismo salto. */
export interface FuentesPedidas {
  fuentes: FuenteVolumen[];
  n: number;
}
const VISTAS_VIEJAS: Readonly<Record<string, FuenteVolumen>> = {
  "trozas-disponibles": "trozas",
  "productos-disponibles": "productos",
};
/** La pila que corresponde a un nombre de pestaña de antes de unificarse. */
export const fuenteDeVistaVieja = (vista: string): FuenteVolumen | null =>
  Object.hasOwn(VISTAS_VIEJAS, vista) ? VISTAS_VIEJAS[vista] : null;

// ── Excel ────────────────────────────────────────────────────────────────────

export function hojasDeVolumen(args: {
  resumen: ResumenVolumen;
  fuentes: readonly FuenteVolumen[];
  porPermiso: readonly FilaVolumen[];
  porEspecie: readonly FilaVolumen[];
  filtros: readonly string[];
  alcance: string | null;
  ahora: Date;
}): HojaExcel[] {
  const { resumen, fuentes } = args;
  const fila = (nombre: string, g: FilaVolumen) => ({
    [nombre]: g.etiqueta,
    ...Object.fromEntries(fuentes.map((f) => [`${ETIQUETA_FUENTE[f]} (m³)`, g.porFuente[f]])),
    "Total (m³)": g.m3,
    "pt aprovechables (estimado)": g.pt,
    "% del total": g.pct,
  });
  return [
    {
      nombre: "Resumen",
      filas: [
        ...fuentes.map((f) => ({
          Pila: ETIQUETA_FUENTE[f],
          Qué: DETALLE_FUENTE[f],
          "m³": resumen.porFuente[f].m3,
          "pt aprovechables (estimado)": resumen.porFuente[f].pt,
          Cantidad: `${resumen.porFuente[f].unidades} ${UNIDAD_FUENTE[f][resumen.porFuente[f].unidades === 1 ? 0 : 1]}`,
        })),
        { Pila: "Total", Qué: "", "m³": resumen.total.m3, "pt aprovechables (estimado)": resumen.total.pt, Cantidad: "" },
      ],
    },
    { nombre: "Por permiso", filas: args.porPermiso.map((g) => fila("Permiso", g)) },
    { nombre: "Por especie", filas: args.porEspecie.map((g) => fila("Especie", g)) },
    {
      nombre: "Qué se exportó",
      filas: [
        { Campo: "Pilas", Valor: fuentes.map((f) => ETIQUETA_FUENTE[f]).join(", ") },
        { Campo: "Filtros", Valor: args.filtros.length ? args.filtros.join(" · ") : "Ninguno" },
        { Campo: "Solo este permiso", Valor: args.alcance ?? "No" },
        { Campo: "pt aprovechables", Valor: "Estimado: troza al 56 % aserrable; aserrada a m³ × 424" },
        { Campo: "Generado", Valor: args.ahora.toLocaleString("es-PE", { timeZone: "America/Lima" }) },
      ],
    },
  ];
}
