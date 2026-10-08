/**
 * tramites-desde-guias — de las guías elegidas en la vista GTF del Libro TH a
 * los casilleros de un formato de Trámites y Oficios (Brandon 07-10:
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
import { filaDesdeGtfLoth, parseGuiasInforme, serializeGuiasInforme, type ItemGtfLoth } from "./tramites-relacion-guias";
import { claveNumeroGtf } from "./gtf-talonario";

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

/** Una `ForestGtf` como la necesita un formato (la arma `guiaParaFormato`). */
export interface GuiaParaFormato {
  id: string;
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
    if (guias.length !== 1) return `Es de una sola guía: elegiste ${guias.length}.`;
    const g = guias[0];
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

/** «TORNILLO (22 trozas)» · «Cumala, Tornillo (5 trozas)» · sin especies, el producto. */
function especieProducto(g: GuiaParaFormato): string {
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

/** Relación de guías: todas a la tabla, sin declarar dos veces la misma ni una anulación que no existió. */
function datosRelacion(guias: GuiaParaFormato[], op: OpcionesDesdeGuias): DatosDesdeGuias {
  const avisos: string[] = [];
  const emitidas = new Set(guias.filter((g) => g.status === "emitida").map((g) => claveDe(g.gtfNumber)));
  const reemitidasExcluidas: string[] = [];
  const reemitidasIncluidas: string[] = [];
  /* Las de «Deshacer la importación» que NO se volvieron a registrar (si se reemitieron, manda el aviso de la reemitida). */
  const deshechasExcluidas: string[] = [];
  const deshechasIncluidas: string[] = [];
  const anuladasVistas = new Map<string, GuiaParaFormato>();
  const repetidasAnuladas = new Set<string>();
  const quedan: GuiaParaFormato[] = [];

  /* La anulada más reciente primero: si una anulada se repite, queda la última. */
  const enOrden = [...guias].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  for (const g of enOrden) {
    if (g.status !== "anulada") {
      quedan.push(g);
      continue;
    }
    const clave = claveDe(g.gtfNumber);
    const reemitida = emitidas.has(clave) || Boolean(g.reemitida);
    if (reemitida || esImportacionDeshecha(g.annulledReason)) {
      if (!op.incluirAnuladasReemitidas) {
        sumarSinRepetir(reemitida ? reemitidasExcluidas : deshechasExcluidas, g.gtfNumber);
        continue;
      }
      sumarSinRepetir(reemitida ? reemitidasIncluidas : deshechasIncluidas, g.gtfNumber);
    }
    if (anuladasVistas.has(clave)) {
      repetidasAnuladas.add(g.gtfNumber);
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
  if (repetidasAnuladas.size) {
    avisos.push(`${[...repetidasAnuladas].join(", ")}: anulada varias veces en el libro (se reimportó). Va una sola vez.`);
  }

  const filas = quedan.map((g) =>
    filaDesdeGtfLoth(`gtf-${g.id}`, {
      gtfNumber: g.gtfNumber,
      gtfDate: g.gtfDate,
      destino: g.destino,
      tipo: g.tipo,
      volumenTotalM3: g.volumenTotalM3,
      status: g.status,
      annulledReason: g.annulledReason,
      tituloHabilitante: g.tituloHabilitante,
      items: g.items,
    }),
  );
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

  const titulares = unicos(quedan.map((g) => g.titularName));
  if (titulares.length === 1) {
    /* PISA al titular que el formulario llena de la Ficha CTP; RUC y
       representante siguen siendo los de la Ficha → de ahí el aviso. */
    datos.entidadNombre = titulares[0];
    const ficha = op.razonSocialFicha?.trim();
    if (ficha && normalizar(ficha) !== normalizar(titulares[0])) {
      avisos.push(`El titular de las guías (${titulares[0]}) no es el de tu Ficha CTP (${ficha}): revisa RUC y representante.`);
    }
  } else if (titulares.length > 1) {
    avisos.push(`Las guías son de ${titulares.length} titulares distintos: la relación va a nombre de uno solo, revísalo.`);
  }
  const sinTrozas = filas.filter((f) => !f.anulada && !f.trozas.trim()).length;
  if (sinTrozas) avisos.push(`${sinTrozas} ${plural(sinTrozas, "guía no trae", "guías no traen")} su lista de trozas en el libro: complétala a mano.`);
  return { datos, avisos, reemitidasExcluidas: [...reemitidasExcluidas, ...deshechasExcluidas] };
}

/**
 * «Incluirla igual» con la relación ya abierta: a la tabla ACTUAL le suma sólo
 * las filas anuladas de los N° que habían quedado afuera (`numeros`), cada una
 * en su lugar por fecha. Lo tipeado y las filas que el operador quitó quedan
 * como están: no se rearma el formulario.
 */
export function sumarFilasExcluidas(actualJson: string | undefined, nuevoJson: string | undefined, numeros: readonly string[]): string {
  const filas = parseGuiasInforme(actualJson);
  const claves = new Set(numeros.map(claveDe));
  const ya = new Set(filas.map((f) => f.uid));
  const nuevas = parseGuiasInforme(nuevoJson).filter((f) => f.anulada && claves.has(claveDe(f.numero)) && !ya.has(f.uid));
  for (const f of nuevas) {
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
    avisos.push(`El N° ${g.gtfNumber} también está emitido en el libro (se volvió a registrar). Si sólo se deshizo una importación, no hay anulación que comunicar.`);
  }
  return { datos, avisos, reemitidasExcluidas: [] };
}

function datosPerdida(g: GuiaParaFormato, formatoId: string): DatosDesdeGuias {
  const vol = fmtVolumen(g.volumenTotalM3);
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
  return { datos: sinVacios(datos), avisos: [], reemitidasExcluidas: [] };
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
  if (uso.uso === "rango") return datosRango(guias, formatoId);
  return formatoId === "anulacion-gtf" ? datosAnulacion(guias[0]) : datosPerdida(guias[0], formatoId);
}
