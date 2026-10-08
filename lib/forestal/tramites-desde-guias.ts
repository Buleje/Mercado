/**
 * tramites-desde-guias — de las guías elegidas en la vista GTF del Libro TH (o
 * en «Guías emitidas» del Libro CTP) a los casilleros de un formato de
 * Trámites y Oficios (Brandon 07-10:
 * «seleccionar las guías … usar ese formato, y automático se rellenarán los
 * datos de las guías emitidas, anuladas, lista de trozas, volumen, permiso»).
 *
 * Qué formato acepta guías y de qué forma lo declara el catálogo
 * (`FormatoTramite.aceptaGuias`); acá vive QUÉ casillero llena cada guía y qué
 * avisos acompañan al llenado. Un dato derivado (la fecha de anulación sale de
 * la última modificación; el período, de las fechas de las guías) se dice en un
 * aviso: nunca se presenta como si el libro lo hubiera guardado.
 *
 * PURO: sin React, sin fetch, sin DOM.
 */

import { FORMATOS_TRAMITE, formatoPorId, type DatosTramite, type FormatoTramite } from "./tramites-catalogo";
import {
  filaDesdeGtfLoth,
  filaDesdeGuiaEmitida,
  listaDeTrozas,
  parseGuiasInforme,
  serializeGuiasInforme,
  type FilaGuiaInforme,
  type ItemGtfLoth,
} from "./tramites-relacion-guias";
import { claveNumeroGtf } from "./gtf-talonario";
import { leerGtfDatos } from "./ctp-gtf-datos";
import { m3DesdePt } from "./cubicacion";
import { clavePermisoOficio, permisosDeLasGuias, type GrupoPermiso } from "./tramites-permiso";

// ─── La anulación de «Deshacer la importación» ───────────────────────────────

/**
 * Cómo empieza el `annulledReason` con que «Deshacer la importación» deja
 * anulada la guía (ADR-461 §12). Esa anulación NO es la del papel: sólo sacó
 * del Libro TH la copia de una guía que SERFOR sigue teniendo vigente. El
 * motivo (`motivoImportacionDeshecha`) y el predicado (`esImportacionDeshecha`)
 * salen de esta MISMA constante: cambiar el texto no los desalinea.
 */
export const PREFIJO_IMPORTACION_DESHECHA = "Importación deshecha";

/** El `annulledReason` que escribe el deshacer (`forest-loth-importar-deshacer.db.ts`). */
export const motivoImportacionDeshecha = (motivo: string): string => `${PREFIJO_IMPORTACION_DESHECHA}: ${motivo}`.slice(0, 500);

/** ¿La guía quedó anulada por «Deshacer la importación» (y no por una anulación ante SERFOR)? */
export function esImportacionDeshecha(annulledReason: string | null | undefined): boolean {
  return (annulledReason ?? "").trim().startsWith(`${PREFIJO_IMPORTACION_DESHECHA}:`);
}

/**
 * Lo propio de una guía del Libro CTP: el despacho declara PRODUCTO con su
 * unidad (pt, m³, unidades, kg), no una lista de trozas medidas como la GTF
 * del Libro TH. Se lleva tal cual: convertir pt a m³ acá sería presentar un
 * derivado como si fuera el dato.
 */
export interface LineaDespachoGuia {
  lineNo: number | null;
  especie: string | null;
  producto: string | null;
  cantidad: number | null;
  unidad: string | null;
  /** A quién se entrega (de los datos de la guía); sin él, el destino. */
  destinatario: string | null;
}

/** El libro de donde sale una guía elegida. */
export type OrigenGuiaFormato = "loth" | "ctp";

/** Una `ForestGtf` (o un despacho del CTP) como la necesita un formato (la arman `guiaParaFormato` / `guiaCtpParaFormato`). */
export interface GuiaParaFormato {
  id: string;
  /** De qué libro salió. Sin el campo = Libro TH (la forma que tenía antes de que el CTP eligiera guías). */
  origen?: OrigenGuiaFormato;
  /** Sólo en las del CTP. */
  despacho?: LineaDespachoGuia;
  gtfNumber: string;
  /** `YYYY-MM-DD` (fecha sin hora del libro) o `null`. */
  gtfDate: string | null;
  tipo: string | null;
  status: "emitida" | "anulada";
  annulledReason: string | null;
  /** ISO de la última modificación: en una anulada, lo más cerca que hay del día de la anulación. */
  updatedAt: string | null;
  tituloHabilitante: string | null;
  titularName: string | null;
  destino: string | null;
  placaVehiculo: string | null;
  conductor: string | null;
  volumenTotalM3: number | null;
  piezasTotal: number | null;
  items: ItemGtfLoth[];
  /** N° de la «Lista de trozas» que trae la guía (`gtfDatos.guia.listaTrozasNro`), o `null`. */
  listaTrozasNro?: string | null;
  /**
   * Anulada cuyo N° tiene una guía EMITIDA vigente en el libro (se volvió a
   * registrar: medido en Blas 07-10, la 019-001-0000001 anulada por
   * «Importación deshecha» y emitida otra vez). Lo marca el servidor, que ve
   * el libro entero y no sólo lo elegido.
   */
  reemitida?: boolean;
}

// ─── De la fila de Prisma al DTO ─────────────────────────────────────────────

/** Lo que llega de `ForestGtf` (Prisma): fechas `Date`, volumen `Decimal`, ítems `Json`. */
export interface FilaGtfCruda {
  id: string;
  gtfNumber: string;
  gtfDate: Date | string | null;
  tipo?: string | null;
  status: string;
  annulledReason?: string | null;
  updatedAt?: Date | string | null;
  tituloHabilitante?: string | null;
  titularName?: string | null;
  destino?: string | null;
  placaVehiculo?: string | null;
  conductor?: string | null;
  volumenTotalM3?: { toString(): string } | number | string | null;
  piezasTotal?: number | null;
  items?: unknown;
  /** JSON crudo de `gtfDatos` (sólo se lee el N° de la lista de trozas). */
  gtfDatos?: unknown;
}

const texto = (v: unknown): string | null =>
  typeof v === "string" ? v.trim() || null : typeof v === "number" && Number.isFinite(v) ? String(v) : null;

const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const isoDe = (v: Date | string | null | undefined): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function itemDe(raw: unknown): ItemGtfLoth | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    code: texto(o.code),
    codigoGuia: texto(o.codigoGuia),
    treeCode: texto(o.treeCode),
    species: texto(o.species),
    diamMayorM: numero(o.diamMayorM),
    diamMenorM: numero(o.diamMenorM),
    lengthM: numero(o.lengthM),
    volumeM3: numero(o.volumeM3),
    productType: texto(o.productType),
  };
}

/** La fila de Prisma lista para viajar al formulario. Tolerante a ítems viejos o a medias. */
export function guiaParaFormato(g: FilaGtfCruda): GuiaParaFormato {
  const vol = g.volumenTotalM3 == null ? null : numero(typeof g.volumenTotalM3 === "object" ? g.volumenTotalM3.toString() : g.volumenTotalM3);
  return {
    id: g.id,
    gtfNumber: g.gtfNumber,
    gtfDate: isoDe(g.gtfDate)?.slice(0, 10) ?? null,
    tipo: g.tipo ?? null,
    status: g.status === "anulada" ? "anulada" : "emitida",
    annulledReason: texto(g.annulledReason),
    updatedAt: isoDe(g.updatedAt),
    tituloHabilitante: texto(g.tituloHabilitante),
    titularName: texto(g.titularName),
    destino: texto(g.destino),
    placaVehiculo: texto(g.placaVehiculo),
    conductor: texto(g.conductor),
    volumenTotalM3: vol,
    piezasTotal: g.piezasTotal ?? null,
    items: Array.isArray(g.items) ? g.items.map(itemDe).filter((x): x is ItemGtfLoth => x !== null) : [],
    listaTrozasNro: g.gtfDatos != null ? texto(leerGtfDatos(g.gtfDatos).guia.listaTrozasNro) : null,
  };
}

/** La llave del N° (tramo a tramo, `claveNumeroGtf`); sin guiones, el texto tal cual. */
const claveDe = (n: string): string => claveNumeroGtf(n) ?? n.trim();

/**
 * Marca las anuladas cuyo N° sigue VIGENTE en el libro (`vigentes` = N° de las
 * guías no anuladas ni borradas del tenant, no sólo las elegidas).
 */
export function marcarReemitidas(guias: GuiaParaFormato[], vigentes: readonly string[]): GuiaParaFormato[] {
  const claves = new Set(vigentes.map(claveDe));
  return guias.map((g) => (g.status === "anulada" && claves.has(claveDe(g.gtfNumber)) ? { ...g, reemitida: true } : g));
}

// ─── Del despacho del Libro CTP al DTO ───────────────────────────────────────

/** Lo que llega de `ForestCtpEntry` (Prisma) para una línea de despacho con GTF. */
export interface FilaDespachoCruda {
  id: string;
  lineNo?: number | null;
  entryDate: Date | string;
  gtfNumber: string | null;
  status: string;
  annulledReason?: string | null;
  updatedAt?: Date | string | null;
  destino?: string | null;
  productType?: string | null;
  speciesCommon?: string | null;
  quantity?: { toString(): string } | number | string | null;
  unit?: string | null;
  /** JSON crudo de `gtfDatos`: se lee con `leerGtfDatos` (tolerante). */
  gtfDatos?: unknown;
}

/** «m3», «m³», «M3» → `m3`; el resto en minúsculas. */
const unidadDe = (u: string | null | undefined): string | null => {
  const t = (u ?? "").trim().toLowerCase().replace("³", "3");
  return t || null;
};

/**
 * Un despacho con GTF del Libro CTP, listo para viajar al formulario.
 *
 * - Anulado = `status` distinto de `registrado` (el mismo criterio que
 *   «Guías emitidas»).
 * - El permiso es `titulos[0]`: el que imprime la guía.
 * - SIN titular: la relación del CTP la presenta el CTP (su Ficha). El
 *   propietario de la guía puede ser un tercero dueño de la madera (art. 172
 *   inc. d) y no es quien declara.
 * - Sin ítems: la guía del CTP no imprime lista de trozas medidas.
 */
export function guiaCtpParaFormato(f: FilaDespachoCruda): GuiaParaFormato {
  const datos = leerGtfDatos(f.gtfDatos);
  const cantidad = f.quantity == null ? null : numero(typeof f.quantity === "object" ? f.quantity.toString() : f.quantity);
  const unidad = unidadDe(f.unit);
  return {
    id: f.id,
    origen: "ctp",
    gtfNumber: (f.gtfNumber ?? "").trim(),
    gtfDate: isoDe(f.entryDate)?.slice(0, 10) ?? null,
    tipo: "producto",
    status: f.status === "registrado" ? "emitida" : "anulada",
    annulledReason: texto(f.annulledReason),
    updatedAt: isoDe(f.updatedAt),
    tituloHabilitante: texto(datos.titulos[0]),
    titularName: null,
    destino: texto(f.destino),
    placaVehiculo: texto(datos.vehiculo.placa),
    conductor: texto(datos.vehiculo.conductor),
    volumenTotalM3: unidad === "m3" ? cantidad : null,
    piezasTotal: unidad === "unidad" && cantidad != null ? Math.round(cantidad) : null,
    items: [],
    listaTrozasNro: texto(datos.guia.listaTrozasNro),
    despacho: {
      lineNo: f.lineNo ?? null,
      especie: texto(f.speciesCommon),
      producto: texto(f.productType),
      cantidad,
      unidad,
      destinatario: texto(datos.destinatario.nombre),
    },
  };
}

// ─── Una guía del CTP = todas sus líneas ─────────────────────────────────────

/**
 * La llave de UNA guía del CTP: su N° y si está vigente. Una GTF puede amparar
 * varias líneas de despacho y se elige ENTERA; una línea anulada del mismo N°
 * (se anuló para corregirla y se volvió a registrar) es otro registro.
 */
const claveGuiaCtp = (gtfNumber: string | null, vigente: boolean): string => `${claveDe(gtfNumber ?? "")}|${vigente ? "v" : "a"}`;

/**
 * `?ids=` del Libro CTP → las GUÍAS enteras (08-10). En «Guías emitidas» se
 * elige la guía, no la línea: con una sola línea de una guía de dos, la
 * relación declaraba la mitad de la carga sin avisar. A las líneas elegidas se
 * suman las del mismo N° y estado (`delMismoNumero`, de
 * `ForestCtpDB.despachosDeLasGuias`); las vigentes de esos N° dicen además si
 * una anulada se volvió a registrar. `faltan` = ids pedidos que ya no están.
 */
export function lineasDeLasGuias<T extends { id: string; status: string; gtfNumber: string | null }>(
  ids: readonly string[],
  elegidas: readonly T[],
  delMismoNumero: readonly T[],
): { filas: T[]; vigentes: string[]; faltan: number } {
  const claves = new Set(elegidas.map((f) => claveGuiaCtp(f.gtfNumber, f.status === "registrado")));
  const porId = new Map<string, T>();
  for (const f of delMismoNumero) {
    if (claves.has(claveGuiaCtp(f.gtfNumber, f.status === "registrado"))) porId.set(f.id, f);
  }
  for (const f of elegidas) if (!porId.has(f.id)) porId.set(f.id, f);
  const encontrados = new Set(elegidas.map((f) => f.id));
  return {
    filas: [...porId.values()],
    vigentes: delMismoNumero.filter((f) => f.status === "registrado").map((f) => (f.gtfNumber ?? "").trim()),
    faltan: [...new Set(ids)].filter((id) => !encontrados.has(id)).length,
  };
}

/**
 * Una línea de despacho del CTP (`guiaCtpParaFormato`). Mira `despacho` además
 * de `origen`: la GTF del Libro TH tiene su propio `origen` (de dónde salió la
 * madera) y nunca trae `despacho`.
 */
const esLineaCtp = (g: object): boolean => "despacho" in g && g.despacho != null && "origen" in g && g.origen === "ctp";

/**
 * Lo elegido, agrupado por GUÍA: las líneas del CTP con el mismo N° y estado
 * son una sola; cada GTF del Libro TH es la suya. Es lo que se cuenta («2
 * guías», «es de una sola guía»), no las líneas.
 */
export function guiasDistintas<T extends GuiaElegida>(guias: readonly T[]): T[][] {
  const grupos = new Map<string, T[]>();
  guias.forEach((g, i) => {
    const k = esLineaCtp(g) ? `ctp|${claveGuiaCtp(g.gtfNumber, g.status !== "anulada")}` : `#${i}`;
    const ya = grupos.get(k);
    if (ya) ya.push(g);
    else grupos.set(k, [g]);
  });
  return [...grupos.values()];
}

/** Cuántas guías (no líneas) hay en lo elegido. */
export const contarGuias = (guias: readonly GuiaElegida[]): number => guiasDistintas(guias).length;

/**
 * Para los formatos de UNA guía (anulación, pérdida): si es del CTP con varias
 * líneas, una sola guía con las líneas juntas —tomar la primera declaraba
 * sólo su cantidad—: especies y productos unidos, la cantidad sumada si
 * comparten unidad. La suma es un derivado: se avisa.
 */
function unaGuia(guias: GuiaParaFormato[]): { g: GuiaParaFormato; aviso: string | null } {
  const [base] = guias;
  const ds = guias.map((x) => x.despacho).filter((d): d is LineaDespachoGuia => d != null);
  if (guias.length <= 1 || ds.length !== guias.length) return { g: base, aviso: null };
  const unidades = unicos(ds.map((d) => d.unidad));
  const sumable = unidades.length === 1 && ds.every((d) => d.cantidad != null);
  const cantidad = sumable ? Number(ds.reduce((a, d) => a + (d.cantidad ?? 0), 0).toFixed(4)) : null;
  const unidad = sumable ? unidades[0] : null;
  const g: GuiaParaFormato = {
    ...base,
    updatedAt: guias.map((x) => x.updatedAt ?? "").sort().pop() || base.updatedAt,
    annulledReason: unicos(guias.map((x) => x.annulledReason)).join(" / ") || null,
    reemitida: guias.some((x) => x.reemitida) || undefined,
    volumenTotalM3: unidad === "m3" ? cantidad : null,
    piezasTotal: unidad === "unidad" && cantidad != null ? Math.round(cantidad) : null,
    despacho: {
      lineNo: base.despacho?.lineNo ?? null,
      especie: unicos(ds.map((d) => d.especie)).join(", ") || null,
      producto: unicos(ds.map((d) => d.producto)).join(", ") || null,
      cantidad,
      unidad,
      destinatario: unicos(ds.map((d) => d.destinatario)).join(" / ") || null,
    },
  };
  const nros = ds.map((d) => d.lineNo).filter((n): n is number => n != null);
  const cuales = nros.length === ds.length ? ` (${nros.map((n) => `#${n}`).join(", ")})` : "";
  const detalle = sumable
    ? `se toman juntas: ${cantidadConUnidad(g.despacho!)}`
    : `en distinta unidad (${ds.map(cantidadConUnidad).filter(Boolean).join(" + ")}): completa el volumen a mano`;
  return { g, aviso: `La GTF ${base.gtfNumber} ampara ${ds.length} líneas de despacho${cuales}: ${detalle}. Revísalo.` };
}

// ─── Qué formatos se pueden usar con lo elegido ──────────────────────────────

/** Lo mínimo para decidir qué formato se puede usar (la tabla tiene esto de cada guía). */
export interface GuiaElegida {
  gtfNumber: string;
  status: string;
  /** Para reconocer la anulada por «Deshacer la importación» (`esImportacionDeshecha`). */
  annulledReason?: string | null;
}

export interface OpcionFormatoGuias {
  formato: FormatoTramite;
  habilitado: boolean;
  /** Por qué no se puede (o qué se va a llenar), en una frase. */
  motivo?: string;
}

/** La serie de un N°: lo que va antes del último guion (`019-001-0000009` → `019-001`). */
export function serieDe(n: string): string {
  const t = n.trim();
  const corte = t.lastIndexOf("-");
  return corte > 0 ? t.slice(0, corte).trim() : "";
}

/** El correlativo: el último tramo (`019-001-0000009` → `0000009`). */
const correlativoDe = (n: string): string => {
  const t = n.trim();
  const corte = t.lastIndexOf("-");
  return corte > 0 ? t.slice(corte + 1).trim() : t;
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

function motivoNoSirve(uso: NonNullable<FormatoTramite["aceptaGuias"]>, guias: readonly GuiaElegida[]): string | null {
  if (guias.length === 0) return "Elige al menos una guía.";
  if (uso.uso === "una") {
    const grupos = guiasDistintas(guias);
    if (grupos.length !== 1) return `Es de una sola guía: elegiste ${grupos.length}.`;
    const g = grupos[0][0];
    if (uso.estado === "anulada" && g.status !== "anulada") return "Es para una guía anulada: ésta está vigente.";
    if (uso.estado === "anulada" && esImportacionDeshecha(g.annulledReason)) {
      return "Se anuló al deshacer su importación al Libro TH, no ante SERFOR: no hay anulación que comunicar.";
    }
    if (uso.estado === "emitida" && g.status === "anulada") return "Es para una guía vigente: ésta está anulada.";
  }
  if (uso.uso === "rango") {
    const sinSerie = guias.find((g) => !serieDe(g.gtfNumber));
    if (sinSerie) return `El N° ${sinSerie.gtfNumber} no trae serie.`;
    const series = [...new Set(guias.map((g) => claveDe(serieDe(g.gtfNumber))))];
    if (series.length > 1) return `Son de ${series.length} series distintas: elige guías de un solo talonario.`;
  }
  return null;
}

const ORDEN_USO: Record<NonNullable<FormatoTramite["aceptaGuias"]>["uso"], number> = { tabla: 0, una: 1, rango: 2 };

/**
 * Los formatos que aceptan guías, en el orden del menú (la relación primero),
 * cada uno con si se puede usar con lo elegido y, si no, por qué.
 */
export function formatosQueAceptan(guias: readonly GuiaElegida[]): OpcionFormatoGuias[] {
  return FORMATOS_TRAMITE.filter((f) => f.aceptaGuias)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => ORDEN_USO[a.f.aceptaGuias!.uso] - ORDEN_USO[b.f.aceptaGuias!.uso] || a.i - b.i)
    .map(({ f }) => {
      const motivo = motivoNoSirve(f.aceptaGuias!, guias);
      return motivo ? { formato: f, habilitado: false, motivo } : { formato: f, habilitado: true };
    });
}

// ─── Qué casilleros llena cada formato ───────────────────────────────────────

export interface OpcionesDesdeGuias {
  /**
   * Incluir en la relación la anulada que no es una anulación ante SERFOR —la
   * que también está emitida o la de «Deshacer la importación»— (por defecto NO va).
   */
  incluirAnuladasReemitidas?: boolean;
  /** Razón social de la Ficha CTP: si el titular de las guías es otro, se avisa (RUC y representante salen de la ficha). */
  razonSocialFicha?: string | null;
  /**
   * El permiso del oficio (su código): las guías de OTRO permiso quedan fuera,
   * con aviso (Brandon 08-10: «un oficio por permiso»). Sin él, van todas.
   */
  permiso?: string | null;
  /** «Incluirlas igual»: mete en el oficio las guías de otro permiso. */
  incluirOtrosPermisos?: boolean;
}

export interface DatosDesdeGuias {
  datos: DatosTramite;
  /** Lo que el operador tiene que mirar antes de presentar, una frase cada uno. */
  avisos: string[];
  /**
   * N° de las anuladas que NO entraron a la relación porque no son una
   * anulación ante SERFOR: también están emitidas o las anuló «Deshacer la
   * importación». El botón «Incluirla igual» las mete (`incluirAnuladasReemitidas`).
   */
  reemitidasExcluidas: string[];
  /** Los permisos de TODAS las guías elegidas (relación): con dos o más, un oficio por permiso. */
  permisos?: GrupoPermiso[];
  /** N° de las guías que quedaron fuera por ser de otro permiso («Incluirlas igual» las mete). */
  fueraDePermiso?: string[];
}

/** `2026-09-03` → `03/09/2026` (fecha sin hora: no pasa por la zona horaria). */
const ddmmaaaa = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** El día de Lima (UTC−5 fijo: Perú no cambia de hora) de un instante ISO. */
const diaLima = (iso: string): string | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t - 5 * 3_600_000).toISOString().slice(0, 10);
};

const fmtVolumen = (v: number | null): string => (v == null ? "" : v.toFixed(3));

const unicos = (xs: (string | null | undefined)[]): string[] => [...new Set(xs.map((x) => x?.trim() ?? "").filter(Boolean))];

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

/** La cantidad con su unidad, como la declaró el despacho: «500 pt», «1.4876 m³». */
const cantidadConUnidad = (d: LineaDespachoGuia): string => {
  if (d.cantidad == null) return "";
  const u = d.unidad === "m3" ? "m³" : d.unidad === "unidad" && d.cantidad !== 1 ? "unidades" : d.unidad;
  return u ? `${d.cantidad} ${u}` : String(d.cantidad);
};

/** «TORNILLO (22 trozas)» · «Cumala, Tornillo (5 trozas)» · sin especies, el producto. CTP: «Tornillo (Madera aserrada, 500 pt)». */
function especieProducto(g: GuiaParaFormato): string {
  if (g.despacho) {
    const d = g.despacho;
    const detalle = [d.producto, cantidadConUnidad(d)].filter(Boolean).join(", ");
    return d.especie ? (detalle ? `${d.especie} (${detalle})` : d.especie) : detalle;
  }
  const especies = unicos(g.items.map((i) => i.species));
  const piezas = g.piezasTotal ?? (g.items.length || null);
  const producto = g.tipo === "producto" ? unicos(g.items.map((i) => i.productType)).join(", ") || "producto forestal" : "trozas";
  const cuenta = piezas ? `${piezas} ${g.tipo === "producto" ? "piezas" : plural(piezas, "troza", "trozas")}` : producto;
  return especies.length ? `${especies.join(", ")} (${cuenta})` : cuenta;
}

const porFecha = (a: GuiaParaFormato, b: GuiaParaFormato) =>
  (a.gtfDate ?? "9999").localeCompare(b.gtfDate ?? "9999") || a.gtfNumber.localeCompare(b.gtfNumber);

const sumarSinRepetir = (lista: string[], n: string) => {
  if (!lista.includes(n)) lista.push(n);
};

/**
 * La llave del N° DENTRO de su libro: el talonario del CTP y el del titular
 * del bosque son papeles distintos, una anulada del CTP no se «reemite» con
 * una GTF del Libro TH del mismo N°.
 */
const claveEnLibro = (g: GuiaParaFormato): string => `${g.origen ?? "loth"}|${claveDe(g.gtfNumber)}`;

/** La fila de la relación según el libro: el adaptador de cada uno vive en `tramites-relacion-guias`. */
function filaDeGuia(g: GuiaParaFormato): FilaGuiaInforme {
  if (g.despacho) {
    const d = g.despacho;
    return {
      ...filaDesdeGuiaEmitida(`ctp-${g.id}`, {
        gtfNumber: g.gtfNumber,
        fecha: g.gtfDate ?? "",
        destinatario: d.destinatario,
        destino: g.destino,
        especie: d.especie,
        producto: d.producto,
        cantidad: d.cantidad,
        unidad: d.unidad,
        /* Sólo se mira si es anulada. */
        estado: g.status === "anulada" ? "anulada" : "completa",
      }),
      motivo: g.status === "anulada" ? (g.annulledReason ?? "") : "",
      permiso: g.tituloHabilitante ?? "",
      listaTrozasNro: g.listaTrozasNro ?? "",
    };
  }
  return filaDesdeGtfLoth(`gtf-${g.id}`, {
    gtfNumber: g.gtfNumber,
    gtfDate: g.gtfDate,
    destino: g.destino,
    tipo: g.tipo,
    volumenTotalM3: g.volumenTotalM3,
    status: g.status,
    annulledReason: g.annulledReason,
    tituloHabilitante: g.tituloHabilitante,
    listaTrozasNro: g.listaTrozasNro ?? "",
    items: g.items,
  });
}

/**
 * Una GTF del CTP puede amparar VARIAS líneas de despacho (dos especies en el
 * mismo camión: `guias-emitidas.numerosRepetidos` lo admite). A SERFOR va una
 * fila por guía: las líneas vigentes del mismo N° se juntan en una, con las
 * cantidades sumadas si tienen la misma unidad (y si no, «a + b»). La suma es
 * un derivado: se dice en un aviso.
 */
function juntarLineas(lineas: GuiaParaFormato[]): { fila: FilaGuiaInforme; aviso: string } {
  const filas = lineas.map(filaDeGuia);
  const base = filas[0];
  const unidades = unicos(filas.map((f) => f.unidad));
  const nums = filas.map((f) => Number(f.cantidad));
  const sumables = unidades.length === 1 && filas.every((f) => f.cantidad.trim() !== "") && nums.every(Number.isFinite);
  const cantidad = sumables
    ? String(Number(nums.reduce((a, b) => a + b, 0).toFixed(4)))
    : filas.map((f) => `${f.cantidad} ${f.unidad}`.trim()).filter(Boolean).join(" + ");
  const fila: FilaGuiaInforme = {
    ...base,
    destinatario: unicos(filas.map((f) => f.destinatario)).join(" / "),
    especie: unicos(filas.map((f) => f.especie)).join(", "),
    producto: unicos(filas.map((f) => f.producto)).join(", "),
    cantidad,
    unidad: sumables ? unidades[0] : "",
  };
  const nros = lineas.map((g) => g.despacho?.lineNo).filter((n): n is number => n != null);
  const cuales = nros.length === lineas.length ? ` (${nros.map((n) => `#${n}`).join(", ")})` : "";
  return {
    fila,
    aviso: `La GTF ${base.numero} ampara ${lineas.length} líneas de despacho${cuales}: va en una sola fila con ${sumables ? `las cantidades sumadas (${cantidad} ${fila.unidad})` : "sus cantidades una tras otra (distinta unidad)"}. Revísala.`,
  };
}

/** Las filas en el orden de las guías; las líneas del CTP con el mismo N° se juntan donde aparece la primera. */
function filasDeGuias(quedan: GuiaParaFormato[]): { filas: FilaGuiaInforme[]; avisos: string[] } {
  const lineasPorGuia = new Map<string, GuiaParaFormato[]>();
  const orden: (GuiaParaFormato | string)[] = [];
  for (const g of quedan) {
    if (g.origen !== "ctp" || g.status !== "emitida") {
      orden.push(g);
      continue;
    }
    const k = claveDe(g.gtfNumber);
    const ya = lineasPorGuia.get(k);
    if (ya) ya.push(g);
    else {
      lineasPorGuia.set(k, [g]);
      orden.push(k);
    }
  }
  const avisos: string[] = [];
  const filas = orden.flatMap((x) => {
    if (typeof x !== "string") return [filaDeGuia(x)];
    const lineas = lineasPorGuia.get(x) ?? [];
    if (lineas.length <= 1) return lineas.map(filaDeGuia);
    const { fila, aviso } = juntarLineas(lineas);
    avisos.push(aviso);
    return [fila];
  });
  return { filas, avisos };
}

/**
 * El permiso manda (Brandon 08-10): con un permiso elegido, las guías que dicen
 * OTRO quedan fuera del oficio, con aviso y «Incluirlas igual». Se compara el
 * CÓDIGO normalizado, nunca el nombre del titular. Las que no dicen ninguno se
 * quedan (no hay con qué compararlas) y se avisa.
 */
function delPermiso(guias: GuiaParaFormato[], op: OpcionesDesdeGuias): { quedan: GuiaParaFormato[]; fuera: string[]; avisos: string[] } {
  const elegido = clavePermisoOficio(op.permiso);
  if (!elegido) return { quedan: guias, fuera: [], avisos: [] };
  const avisos: string[] = [];
  const sinPermiso = unicos(guias.filter((g) => !clavePermisoOficio(g.tituloHabilitante)).map((g) => g.gtfNumber));
  if (sinPermiso.length) {
    const n = sinPermiso.length;
    avisos.push(`${plural(n, "La GTF", "Las GTF")} ${sinPermiso.join(", ")} no ${plural(n, "dice", "dicen")} su permiso: ${plural(n, "va", "van")} en este oficio, revísalo.`);
  }
  const deOtro = guias.filter((g) => {
    const k = clavePermisoOficio(g.tituloHabilitante);
    return k !== null && k !== elegido;
  });
  const numeros = unicos(deOtro.map((g) => g.gtfNumber));
  if (numeros.length === 0) return { quedan: guias, fuera: [], avisos };
  const codigos = unicos(deOtro.map((g) => g.tituloHabilitante)).join(", ");
  if (op.incluirOtrosPermisos) {
    avisos.push(`Incluiste ${numeros.join(", ")}, del permiso ${codigos}: confirma que van en el oficio del ${op.permiso?.trim()}.`);
    return { quedan: guias, fuera: [], avisos };
  }
  const n = numeros.length;
  avisos.push(`${plural(n, "La GTF", "Las GTF")} ${numeros.join(", ")} ${plural(n, "es", "son")} de otro permiso (${codigos}): ${plural(n, "queda", "quedan")} fuera de este oficio.`);
  return { quedan: guias.filter((g) => !deOtro.includes(g)), fuera: numeros, avisos };
}

/** Relación de guías: las del permiso a la tabla, sin declarar dos veces la misma ni una anulación que no existió. */
function datosRelacion(todas: GuiaParaFormato[], op: OpcionesDesdeGuias): DatosDesdeGuias {
  const { quedan: guias, fuera: fueraDePermiso, avisos } = delPermiso(todas, op);
  const emitidas = new Set(guias.filter((g) => g.status === "emitida").map(claveEnLibro));
  const reemitidasExcluidas: string[] = [];
  const reemitidasIncluidas: string[] = [];
  /* Las de «Deshacer la importación» que NO se volvieron a registrar (si se reemitieron, manda el aviso de la reemitida). */
  const deshechasExcluidas: string[] = [];
  const deshechasIncluidas: string[] = [];
  const anuladasVistas = new Map<string, GuiaParaFormato>();
  /* N° → libro: el aviso dice por qué se repite según de dónde sale. */
  const repetidasAnuladas = new Map<string, OrigenGuiaFormato>();
  const quedan: GuiaParaFormato[] = [];

  /* La anulada más reciente primero: si una anulada se repite, queda la última. */
  const enOrden = [...guias].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  for (const g of enOrden) {
    if (g.status !== "anulada") {
      quedan.push(g);
      continue;
    }
    const clave = claveEnLibro(g);
    const reemitida = emitidas.has(clave) || Boolean(g.reemitida);
    if (reemitida || esImportacionDeshecha(g.annulledReason)) {
      if (!op.incluirAnuladasReemitidas) {
        sumarSinRepetir(reemitida ? reemitidasExcluidas : deshechasExcluidas, g.gtfNumber);
        continue;
      }
      sumarSinRepetir(reemitida ? reemitidasIncluidas : deshechasIncluidas, g.gtfNumber);
    }
    if (anuladasVistas.has(clave)) {
      repetidasAnuladas.set(g.gtfNumber, g.origen ?? "loth");
      continue;
    }
    anuladasVistas.set(clave, g);
    quedan.push(g);
  }
  quedan.sort(porFecha);

  if (reemitidasExcluidas.length) {
    avisos.push(
      `${plural(reemitidasExcluidas.length, "La GTF", "Las GTF")} ${reemitidasExcluidas.join(", ")} ${plural(reemitidasExcluidas.length, "está anulada y también emitida", "están anuladas y también emitidas")} (se volvió a registrar): no va como anulada, para no declarar a SERFOR una anulación que no existió.`,
    );
  }
  if (deshechasExcluidas.length) {
    avisos.push(
      `${plural(deshechasExcluidas.length, "La GTF", "Las GTF")} ${deshechasExcluidas.join(", ")} se ${plural(deshechasExcluidas.length, "anuló", "anularon")} al deshacer su importación al Libro TH, no ante SERFOR: no va como anulada, para no declarar una anulación que no existió.`,
    );
  }
  if (reemitidasIncluidas.length) {
    avisos.push(`Incluiste como anulada ${reemitidasIncluidas.join(", ")}, que también está emitida: confirma que de verdad se anuló un papel con ese N°.`);
  }
  if (deshechasIncluidas.length) {
    avisos.push(`Incluiste como anulada ${deshechasIncluidas.join(", ")}, que se anuló al deshacer su importación: confirma que de verdad se anuló un papel con ese N°.`);
  }
  const repetidasDe = (libro: OrigenGuiaFormato) => [...repetidasAnuladas].filter(([, l]) => l === libro).map(([n]) => n);
  if (repetidasDe("loth").length) {
    avisos.push(`${repetidasDe("loth").join(", ")}: anulada varias veces en el libro (se reimportó). Va una sola vez.`);
  }
  /* En el CTP no hay reimportación: el N° se repite porque la guía amparaba
     varias líneas o porque la línea se anuló más de una vez al corregirla. */
  if (repetidasDe("ctp").length) {
    avisos.push(`${repetidasDe("ctp").join(", ")}: varias líneas anuladas con ese N° en el Libro CTP. Va una sola vez, como anulada.`);
  }

  const { filas, avisos: avisosLineas } = filasDeGuias(quedan);
  avisos.push(...avisosLineas);
  const datos: DatosTramite = { guiasJson: serializeGuiasInforme(filas) };

  const fechas = quedan.map((g) => g.gtfDate).filter((f): f is string => Boolean(f)).sort();
  if (fechas.length) {
    datos.periodoDesde = fechas[0];
    datos.periodoHasta = fechas[fechas.length - 1];
    avisos.push(
      `El período sale de las fechas de las guías (${ddmmaaaa(fechas[0])} al ${ddmmaaaa(fechas[fechas.length - 1])}): ajústalo si declaras un tramo más largo.`,
    );
  }
  const series = unicos(quedan.map((g) => serieDe(g.gtfNumber)));
  if (series.length) datos.serieGtfInforme = series.join(", ");

  const permiso = op.permiso?.trim();
  if (permiso) datos.permisoCodigo = permiso;
  const titulares = unicos(quedan.map((g) => g.titularName));
  const ficha = op.razonSocialFicha?.trim();
  if (permiso && titulares.length > 0) {
    /* Titular, RUC y representante los pone el permiso elegido en el formulario
       (`datosDelPermiso`); mientras tanto (o si el permiso no está cargado como
       contrato) el titular de las guías, y el RUC y el representante de la
       Ficha NO quedan bajo otro nombre: se vacían para llenarlos. */
    datos.entidadNombre = titulares[0];
    if (titulares.length > 1) {
      avisos.push(`Las guías escriben al titular de ${titulares.length} formas (${titulares.join(" / ")}): va «${titulares[0]}», corrígelo si hace falta.`);
    }
    if (ficha && normalizar(ficha) !== normalizar(titulares[0])) {
      datos.entidadRuc = "";
      datos.entidadRepresentante = "";
      avisos.push(`El titular de las guías (${titulares[0]}) no es el de tu Ficha CTP (${ficha}): el RUC y el representante salen del permiso; revisa RUC y representante.`);
    }
  } else if (titulares.length === 1) {
    /* PISA al titular que el formulario llena de la Ficha CTP; RUC y
       representante siguen siendo los de la Ficha → de ahí el aviso. */
    datos.entidadNombre = titulares[0];
    if (ficha && normalizar(ficha) !== normalizar(titulares[0])) {
      avisos.push(`El titular de las guías (${titulares[0]}) no es el de tu Ficha CTP (${ficha}): revisa RUC y representante.`);
    }
  } else if (titulares.length > 1) {
    avisos.push(`Las guías son de ${titulares.length} titulares distintos: la relación va a nombre de uno solo, revísalo.`);
  }
  /* Sólo las del Libro TH: la guía del CTP ampara producto y no imprime lista de trozas medidas. */
  const sinTrozas = filas.filter((f) => f.origen === "loth" && !f.anulada && !f.trozas.trim()).length;
  if (sinTrozas) avisos.push(`${sinTrozas} ${plural(sinTrozas, "guía no trae", "guías no traen")} el detalle de sus trozas en el libro: complétalo a mano si imprimes el detalle.`);
  const sinNroLista = filas.filter((f) => listaDeTrozas(f)?.derivada).length;
  if (sinNroLista) {
    avisos.push(`${sinNroLista} ${plural(sinNroLista, "guía no trae", "guías no traen")} el N° de su lista de trozas: va el N° de la GTF (marcado en el papel), revísalo.`);
  }
  return {
    datos,
    avisos,
    reemitidasExcluidas: [...reemitidasExcluidas, ...deshechasExcluidas],
    permisos: permisosDeLasGuias(todas),
    fueraDePermiso,
  };
}

/** Las filas de `despuesJson` que no estaban en `antesJson` (por `uid`): lo que sumó «Incluirla igual». */
export function filasNuevas(antesJson: string | undefined, despuesJson: string | undefined): string {
  const antes = new Set(parseGuiasInforme(antesJson).map((f) => f.uid));
  return serializeGuiasInforme(parseGuiasInforme(despuesJson).filter((f) => !antes.has(f.uid)));
}

/**
 * «Incluirla igual» con la relación ya abierta: a la tabla ACTUAL le suma las
 * filas nuevas (`filasNuevas`), cada una en su lugar por fecha. Lo tipeado y
 * las filas que el operador quitó quedan como están: no se rearma el formulario.
 */
export function sumarFilas(actualJson: string | undefined, nuevasJson: string | undefined): string {
  const filas = parseGuiasInforme(actualJson);
  const ya = new Set(filas.map((f) => f.uid));
  for (const f of parseGuiasInforme(nuevasJson)) {
    if (ya.has(f.uid)) continue;
    ya.add(f.uid);
    const i = filas.findIndex((x) => Boolean(x.fecha && f.fecha) && x.fecha > f.fecha);
    filas.splice(i < 0 ? filas.length : i, 0, f);
  }
  return serializeGuiasInforme(filas);
}

function datosAnulacion(g: GuiaParaFormato): DatosDesdeGuias {
  const avisos: string[] = [];
  const datos: DatosTramite = { numeroGtfAnulada: g.gtfNumber };
  if (g.gtfDate) datos.fechaEmisionOriginal = g.gtfDate;
  if (g.annulledReason) datos.motivoAnulacion = g.annulledReason;
  const dia = g.updatedAt ? diaLima(g.updatedAt) : null;
  if (dia) {
    datos.fechaAnulacion = dia;
    avisos.push(`La fecha de anulación (${ddmmaaaa(dia)}) sale de la última modificación de la guía: el libro no guarda el día exacto. Confírmala.`);
  }
  if (g.reemitida) {
    /* En el CTP se anula la LÍNEA del libro para corregirla y se vuelve a
       registrar con la misma guía: el papel nunca se anuló. */
    const cuando = g.origen === "ctp" ? "se anuló la línea del despacho para corregirla" : "se deshizo una importación";
    avisos.push(`El N° ${g.gtfNumber} también está emitido en el libro (se volvió a registrar). Si sólo ${cuando}, no hay anulación que comunicar.`);
  }
  return { datos, avisos, reemitidasExcluidas: [] };
}

/**
 * El volumen amparado en m³ (el formato lo escribe «… de X m³ de …»). Una
 * guía del CTP en pie tablar se convierte (÷ 424) y se avisa; en unidades o
 * kg no hay m³ que dar: queda vacío, con el aviso de completarlo.
 */
function volumenAmparado(g: GuiaParaFormato): { vol: string; aviso: string | null } {
  const d = g.despacho;
  if (!d || g.volumenTotalM3 != null || d.cantidad == null) return { vol: fmtVolumen(g.volumenTotalM3), aviso: null };
  if (d.unidad === "pt") {
    const m3 = m3DesdePt(d.cantidad);
    return {
      vol: fmtVolumen(m3),
      aviso: `El volumen sale de convertir ${d.cantidad} pt a m³ (÷ 424 = ${fmtVolumen(m3)} m³): confírmalo con lo que dice la guía.`,
    };
  }
  return { vol: "", aviso: `La guía ampara ${cantidadConUnidad(d)} y el formato pide m³: completa el volumen a mano.` };
}

function datosPerdida(g: GuiaParaFormato, formatoId: string): DatosDesdeGuias {
  const { vol, aviso } = volumenAmparado(g);
  const esp = especieProducto(g);
  const datos: DatosTramite =
    formatoId === "denuncia-policial-perdida-gtf"
      ? {
          numeroGtfPerdida: g.gtfNumber,
          especieProductoPerdido: esp,
          volumenAmparadoPerdido: vol,
          personaACargoGtf: g.conductor ?? "",
          vehiculoPlacaGtf: g.placaVehiculo ?? "",
        }
      : {
          numeroGtfPerdidaSerfor: g.gtfNumber,
          fechaEmisionOriginalPerdida: g.gtfDate ?? "",
          especieProductoPerdidoSerfor: esp,
          volumenAmparadoPerdidoSerfor: vol,
          destinoGuiaPerdida: g.destino ?? "",
        };
  return { datos: sinVacios(datos), avisos: aviso ? [aviso] : [], reemitidasExcluidas: [] };
}

/** Del primero al último correlativo, con los huecos que haya en medio. */
function datosRango(guias: GuiaParaFormato[], formatoId: string): DatosDesdeGuias {
  const avisos: string[] = [];
  const conNumero = guias
    .map((g) => ({ g, n: Number(correlativoDe(g.gtfNumber).replace(/\D/g, "")) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n);
  if (conNumero.length === 0) return { datos: {}, avisos: ["Los N° elegidos no traen correlativo."], reemitidasExcluidas: [] };
  const primero = conNumero[0].g.gtfNumber.trim();
  const ultimo = conNumero[conNumero.length - 1].g.gtfNumber.trim();
  const serie = serieDe(primero);
  if (formatoId === "visado-talonario-gtf") {
    return {
      datos: { serieActual: serie, ultimoCorrelativo: correlativoDe(ultimo) },
      avisos: [`El último correlativo es el mayor de las guías elegidas (${ultimo}): si emitiste otra después, corrígelo.`],
      reemitidasExcluidas: [],
    };
  }
  const distintos = new Set(conNumero.map((x) => x.n)).size;
  const huecos = conNumero[conNumero.length - 1].n - conNumero[0].n + 1 - distintos;
  if (huecos > 0) avisos.push(`El rango ${primero} al ${ultimo} incluye ${huecos} N° que no elegiste: confirma que también se perdieron.`);
  return {
    datos: { serieExtraviada: serie, rangoNumeros: primero === ultimo ? primero : `${primero} al ${ultimo}` },
    avisos,
    reemitidasExcluidas: [],
  };
}

const sinVacios = (d: DatosTramite): DatosTramite => Object.fromEntries(Object.entries(d).filter(([, v]) => v.trim() !== ""));

/**
 * Los casilleros que llenan las guías en ese formato, más los avisos. `null`
 * si el formato no acepta guías o lo elegido no le sirve (`formatosQueAceptan`
 * dice por qué).
 */
export function datosDesdeGuias(formatoId: string, guias: GuiaParaFormato[], op: OpcionesDesdeGuias = {}): DatosDesdeGuias | null {
  const formato = formatoPorId(formatoId);
  const uso = formato?.aceptaGuias;
  if (!formato || !uso || motivoNoSirve(uso, guias)) return null;
  if (uso.uso === "tabla") return datosRelacion(guias, op);
  if (uso.uso === "rango") return conPermisoUnico(datosRango(guias, formatoId), guias);
  const { g, aviso } = unaGuia(guias);
  /* La anulación no declara cantidad: el aviso de las líneas sumadas sería ruido. */
  if (formatoId === "anulacion-gtf") return conPermisoUnico(datosAnulacion(g), [g]);
  const r = conPermisoUnico(datosPerdida(g, formatoId), [g]);
  return aviso ? { ...r, avisos: [aviso, ...r.avisos] } : r;
}

/**
 * Los formatos hermanos de la relación también llevan el título del permiso
 * arriba (ADR-487): si todas las guías dicen el MISMO permiso, va su código;
 * con dos o ninguno, no se elige por el operador.
 */
function conPermisoUnico(r: DatosDesdeGuias, guias: readonly GuiaParaFormato[]): DatosDesdeGuias {
  const codigos = unicos(guias.map((g) => g.tituloHabilitante ?? "").filter((c) => clavePermisoOficio(c)));
  const claves = new Set(codigos.map((c) => clavePermisoOficio(c)));
  return claves.size === 1 ? { ...r, datos: { ...r.datos, permisoCodigo: codigos[0] } } : r;
}
