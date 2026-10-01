/**
 * anexo04-registro — un ANEXO N° 04 EMITIDO. El papel que se entregó con la
 * guía: quién lo firmó, con qué N°, qué GTF ampara y exactamente qué medidas
 * llevaba. Se guarda para poder re-imprimir el mismo documento meses después
 * (una fiscalización pide el anexo, no la cubicación del día).
 *
 * PURO y client-safe: lo usan el componente y la capa de datos. Los totales se
 * RECALCULAN desde las piezas — lo que manda el cliente no se cree.
 */
import { cubicarPieza, type PiezaCubicada } from "./cubicacion";
import { construirAnexo04, siguienteCorrelativo, type DatosAnexo04, type UnidadVolumen } from "./anexo04-serfor";
import { mismoNumeroGtf } from "./gtf-talonario";

export interface AnexoEmitido {
  id: string;
  /** (1) N° del anexo. */ numero: string;
  /** (2) GTF N° que ampara la salida. */ gtf: string;
  /** Fecha de emisión (date-only AAAA-MM-DD). */ fecha: string;
  empresa: string;
  firmante: string;
  documento: string;
  cargo: string;
  observaciones: string;
  unidadV: UnidadVolumen;
  modo: "oficial" | "compacto";
  /** Cuántas hojas salió el anexo (informativo en la bandeja). */ hojas: number;
  totalPiezas: number;
  totalPt: number;
  /** (3) VOLUMEN TOTAL en m³, recalculado desde las piezas. */ totalM3: number;
  /**
   * El (3) VOLUMEN TOTAL que el emisor declaró A MANO, si declaró uno.
   *
   * Se guarda para poder **re-imprimir el mismo papel**: sin esto, un anexo
   * emitido con un total declarado (porque la guía ampara ese número y las
   * piezas caen 3 litros abajo) se re-descargaba con el total calculado y el
   * papel de la fiscalización no era el que se entregó (Brandon, 2026-09-09).
   *
   * NO reemplaza a `totalM3`: ese sigue saliendo de las piezas, que es lo que
   * el servidor sabe verificar. Los dos conviven, y la bandeja muestra la
   * diferencia cuando la hay.
   */
  totalManualM3?: number | null;
  /** Las medidas exactas que se imprimieron: sin esto no se puede re-emitir. */
  piezas: PiezaCubicada[];
  /** Especie del lote al emitir: sin ella, una pieza sin especie propia
   *  reimprimiría "SIN ESPECIE" y el papel no sería el mismo. */
  especieGlobal?: string;
  /** Despacho del Libro CTP del que salió, si se emitió desde ahí. */ ctpEntryId?: string;
  /**
   * Las líneas de Despacho que registraron en el libro la salida de este papel
   * (ADR-446, «Guías sin registrar»). Vacío o ausente = el libro todavía no la
   * tiene. Si esos despachos se anulan, el anexo vuelve a estar pendiente: se
   * mira el estado del despacho, no esta lista sola.
   */
  despachoIds?: string[];
  /** Cuándo y quién la registró desde el anexo. */
  registradoAt?: string;
  registradoPor?: string;
  /**
   * Otro anexo de la MISMA guía que vale en su lugar (ADR-446, decisión 1: la
   * 064 viajó con el de 256 piezas). No se borra —es un papel que existió—,
   * pero no se registra.
   */
  reemplazadoPor?: string | null;
  createdAt: string;
  createdBy?: string;
}

/** Los campos que atan el anexo al libro: no los escribe el cubicador, y volver a bajar el papel no los borra. */
export type VinculosDelAnexo = Pick<AnexoEmitido, "despachoIds" | "registradoAt" | "registradoPor" | "reemplazadoPor">;

/**
 * Los vínculos de un registro, sólo los que tiene. `construirEmision` arma el
 * registro desde las piezas y NO los conoce: re-descargar el anexo (corregir
 * una observación) sin esto los borraba y la guía volvía a «sin registrar»
 * con sus despachos ya en el libro.
 */
export function vinculosDe(a: Partial<VinculosDelAnexo> | null | undefined): VinculosDelAnexo {
  const out: VinculosDelAnexo = {};
  if (!a) return out;
  if (Array.isArray(a.despachoIds) && a.despachoIds.length > 0) out.despachoIds = [...a.despachoIds];
  if (a.registradoAt) out.registradoAt = a.registradoAt;
  if (a.registradoPor) out.registradoPor = a.registradoPor;
  if (a.reemplazadoPor) out.reemplazadoPor = a.reemplazadoPor;
  return out;
}

/** ¿El libro ya registró este anexo? (tiene despachos atados; si se anularon, lo mira la capa de datos). */
export const tieneDespachos = (a: Pick<AnexoEmitido, "despachoIds">): boolean => (a.despachoIds?.length ?? 0) > 0;

/**
 * El tope de la bandeja sin expulsar lo que respalda al libro (ADR-446): se
 * descartan primero los anexos más viejos SIN despachos. Uno registrado nunca
 * sale, aunque la bandeja quede por encima del tope.
 */
export function recortarBandeja(
  lista: readonly AnexoEmitido[],
  max: number,
  /** El que se está guardando: nunca se descarta a sí mismo. */
  protegido?: string,
): AnexoEmitido[] {
  if (lista.length <= max) return [...lista];
  let sobran = lista.length - max;
  const fuera = new Set<string>();
  for (let i = lista.length - 1; i >= 0 && sobran > 0; i--) {
    if (tieneDespachos(lista[i]) || lista[i].id === protegido) continue;
    fuera.add(lista[i].id);
    sobran--;
  }
  return lista.filter((a) => !fuera.has(a.id));
}

/** Una fila cuyo m³ no sale de sus medidas, por más de esto, no se guarda (m³ por fila). */
export const TOL_FILA_M3 = 0.001;

/**
 * ¿El volumen que trae la fila cuadra con sus medidas? El m³ y el pie tablar
 * los calcula el cubicador desde espesor × ancho × largo (`cubicarPieza`), y
 * el libro registra la salida con ESE m³: uno inventado por el cliente
 * terminaría declarado ante SERFOR. Se tolera el redondeo por fila (en Blas,
 * 335 de 1244 filas difieren y ninguna pasa de 0,0007).
 */
export function filaNoCuadra(p: PiezaCubicada): { calculadoM3: number; declaradoM3: number } | null {
  const { m3 } = cubicarPieza(p);
  const declarado = Number(p.m3);
  if (!Number.isFinite(declarado)) return { calculadoM3: m3, declaradoM3: declarado };
  return Math.abs(declarado - m3) > TOL_FILA_M3 ? { calculadoM3: m3, declaradoM3: declarado } : null;
}

/**
 * Ata el anexo a los despachos que lo registraron y marca «reemplazado» a los
 * otros anexos de la MISMA guía (por tramos: `019-001-…` ≡ `19-001-…`) que
 * todavía no están en el libro. Puro: la capa de datos lo aplica dentro de la
 * transacción que crea los despachos.
 */
export function vincularDespachos(
  lista: readonly AnexoEmitido[],
  anexoId: string,
  despachoIds: readonly string[],
  user: string,
  ahora: string,
): { lista: AnexoEmitido[]; reemplazados: AnexoEmitido[] } {
  const anexo = lista.find((a) => a.id === anexoId);
  if (!anexo) return { lista: [...lista], reemplazados: [] };
  const reemplazados: AnexoEmitido[] = [];
  const nueva = lista.map((a) => {
    if (a.id === anexoId) {
      return { ...a, despachoIds: [...despachoIds], registradoAt: ahora, registradoPor: user, reemplazadoPor: null };
    }
    if (a.gtf && mismoNumeroGtf(a.gtf, anexo.gtf) && !a.despachoIds?.length && !a.reemplazadoPor) {
      const marcado = { ...a, reemplazadoPor: anexoId };
      reemplazados.push(marcado);
      return marcado;
    }
    return a;
  });
  return { lista: nueva, reemplazados };
}

/** Fecha de hoy date-only (misma convención que el resto del módulo). */
const hoy = () => new Date().toISOString().slice(0, 10);

export interface EntradaEmision {
  id?: string;
  datos: Pick<DatosAnexo04, "numero" | "gtf" | "empresa" | "firmante" | "documento" | "cargo" | "observaciones" | "unidadV" | "modo">;
  piezas: PiezaCubicada[];
  /** El (3) VOLUMEN TOTAL declarado a mano al emitir, si hubo uno. */
  totalManualM3?: number | null;
  especieGlobal?: string;
  ctpEntryId?: string;
  fecha?: string;
  createdAt?: string;
  createdBy?: string;
}

/**
 * Arma el registro de una emisión. Es la ÚNICA vía de creación: hojas y totales
 * salen de `construirAnexo04` sobre las piezas recibidas, así el historial no
 * puede contradecir al papel.
 */
export function construirEmision(input: EntradaEmision): AnexoEmitido {
  const { datos, piezas } = input;
  const anexo = construirAnexo04(piezas, { unidadV: datos.unidadV, modo: datos.modo }, { especieGlobal: input.especieGlobal });
  const ahora = new Date().toISOString();
  return {
    id: input.id ?? `anx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    numero: (datos.numero ?? "").trim(),
    gtf: (datos.gtf ?? "").trim(),
    fecha: input.fecha ?? hoy(),
    empresa: (datos.empresa ?? "").trim(),
    firmante: (datos.firmante ?? "").trim(),
    documento: (datos.documento ?? "").trim(),
    cargo: (datos.cargo ?? "").trim(),
    observaciones: (datos.observaciones ?? "").trim(),
    unidadV: datos.unidadV,
    modo: datos.modo,
    hojas: anexo.hojas.length,
    totalPiezas: anexo.totalPiezas,
    totalPt: anexo.totalPt,
    totalM3: anexo.totalM3,
    /* Sólo si difiere de verdad del calculado: guardar «1,840 declarado» sobre
       un anexo que ya suma 1,840 es un campo que después hay que explicar. */
    totalManualM3:
      input.totalManualM3 != null &&
      Number.isFinite(input.totalManualM3) &&
      Math.abs(input.totalManualM3 - anexo.totalM3) >= 0.0005
        ? Math.round(input.totalManualM3 * 1000) / 1000
        : null,
    piezas,
    especieGlobal: input.especieGlobal,
    ctpEntryId: input.ctpEntryId,
    createdAt: input.createdAt ?? ahora,
    createdBy: input.createdBy,
  };
}

/**
 * Clave de identidad de una emisión: N° + GTF. Re-descargar el mismo anexo
 * (corregir una observación y volver a bajarlo) ACTUALIZA el registro en vez de
 * llenar la bandeja de duplicados; un N° distinto sí es otro documento.
 */
export const claveEmision = (numero: string, gtf: string): string =>
  `${numero.trim().toLowerCase()}||${gtf.trim().toLowerCase()}`;

/**
 * Filtra la bandeja por N°, GTF, firmante, empresa o fecha. Un aserradero con
 * 200 emisiones necesita encontrar "la del camión de Lima" sin scrollear.
 */
export function filtrarEmisiones(lista: AnexoEmitido[], termino: string): AnexoEmitido[] {
  const t = termino.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((a) =>
    [a.numero, a.gtf, a.firmante, a.empresa, a.fecha, a.observaciones]
      .some((campo) => (campo ?? "").toLowerCase().includes(t)),
  );
}

/**
 * Primer correlativo LIBRE a partir de `base`: el que no esté usado por otra
 * GTF. Es lo que se le ofrece al operario cuando el N° que tiene cargado choca
 * con un anexo ya emitido — corregirlo a mano invita a inventar un número.
 */
export function siguienteLibre(base: string, emitidos: AnexoEmitido[], gtf: string): string {
  const propia = gtf.trim().toLowerCase();
  const usado = (n: string) =>
    emitidos.some((a) => a.numero.trim().toLowerCase() === n.trim().toLowerCase() && a.gtf.trim().toLowerCase() !== propia);
  let candidato = base;
  // Tope duro: un correlativo sin dígitos no avanza nunca (devuelve el mismo).
  for (let i = 0; i < 500 && usado(candidato); i++) {
    const sig = siguienteCorrelativo(candidato);
    if (sig === candidato) break;
    candidato = sig;
  }
  return candidato;
}

/**
 * Con qué arranca el modal según lo que ya hay emitido. Dos casos reales:
 *
 * 1. La guía YA tiene anexo → lo más probable es que vengan a re-imprimirlo o a
 *    corregirlo, no a emitir uno nuevo: se carga el más reciente.
 * 2. El N° que quedó guardado es el de la guía anterior → ese número ya está
 *    usado, y proponer el siguiente libre evita el error antes de que aparezca.
 *
 * Lo que el operario escriba después manda: esto sólo decide el punto de partida.
 */
export function inicioDeEmision(
  numeroActual: string,
  gtf: string,
  emitidos: AnexoEmitido[],
  ctpEntryId?: string,
): { emision?: AnexoEmitido; numeroSugerido?: string } {
  if (ctpEntryId) {
    const deLaGuia = emitidos
      .filter((a) => a.ctpEntryId === ctpEntryId)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    if (deLaGuia.length > 0) return { emision: deLaGuia[0] };
  }
  if (!numeroActual.trim()) return {};
  const libre = siguienteLibre(numeroActual, emitidos, gtf);
  return libre === numeroActual ? {} : { numeroSugerido: libre };
}

/** Meses (AAAA-MM) con emisiones, del más reciente al más viejo. */
export function mesesDeEmisiones(lista: AnexoEmitido[]): string[] {
  return [...new Set(lista.map((a) => (a.fecha ?? "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))]
    .sort((a, b) => b.localeCompare(a));
}

/** Sólo las emisiones de ese mes (AAAA-MM). Vacío = todas. */
export const emisionesDelMes = (lista: AnexoEmitido[], mes: string): AnexoEmitido[] =>
  mes ? lista.filter((a) => (a.fecha ?? "").startsWith(mes)) : lista;

/** "2026-07" → "julio 2026", para el selector del período. */
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  if (!y || !m) return mes;
  const nombre = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" });
  return `${nombre} ${y}`;
}

/** Etiqueta corta para la bandeja: "N° 2-19-0461363 · GTF 19-001-0000052". */
export function etiquetaEmision(e: AnexoEmitido): string {
  const partes = [e.numero ? `N° ${e.numero}` : null, e.gtf ? `GTF ${e.gtf}` : null].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Anexo sin numerar";
}
