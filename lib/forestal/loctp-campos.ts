/**
 * loctp-campos.ts — las CUATRO secciones del formato OFICIAL del Libro de
 * Operaciones de CTP (LO-CTP, RDE D000025-2023-MIDAGRI-SERFOR-DE) con la
 * numeración exacta de sus casilleros, y qué le falta a cada fila para poder
 * presentarse ante SERFOR.
 *
 * PURO: lo importan el form, la tabla y el export, así que la etiqueta y el
 * número de casillero que ve el operador son los mismos en los tres lados. Un
 * libro donde la pantalla dice "Código de origen" y el export dice otra cosa no
 * se puede cruzar contra el sistema del SNIFFS.
 *
 * ⚠️ La numeración de acá se transcribió de la Guía Práctica oficial (verificado
 * 2026-07-30, cita literal de las secciones 1 a 4). No la "arregles" de memoria:
 * dos suposiciones razonables ya salieron mal —Ingresos tiene 13 casilleros (no
 * 12) y el casillero 10 es el código que el CTP ASIGNA al producto que entra, no
 * el código de otro CTP—. Fuente en el ADR-311.
 *
 * Los catálogos (documento, unidad) son los que la guía lista. Los CÓDIGOS en
 * cambio son texto libre a propósito: los emite la ARFFS o el propio centro y
 * varían por región — un patrón adivinado rechazaría datos legítimos.
 */

/** (3) "Tipo de documento" que ampara el transporte, en siglas. */
export const TIPOS_DOCUMENTO_LOCTP = [
  { valor: "GTF", label: "GTF — Guía de Transporte Forestal" },
  { valor: "GRR", label: "GRR — Guía de Remisión de Remitente" },
  { valor: "Otros", label: "Otros — especificar en observaciones" },
] as const;

export type TipoDocumentoLoctp = (typeof TIPOS_DOCUMENTO_LOCTP)[number]["valor"];

/** Unidad de medida. El libro calcula en m³; las otras quedan informativas. */
export const UNIDADES_LOCTP = [
  { valor: "m3", label: "m³ — metros cúbicos" },
  { valor: "unidad", label: "Unidad — unidades de producto" },
  { valor: "kg", label: "kg" },
  { valor: "tonelada", label: "Tonelada" },
] as const;

export type UnidadLoctp = (typeof UNIDADES_LOCTP)[number]["valor"];

export function esTipoDocumentoLoctp(v: unknown): v is TipoDocumentoLoctp {
  return TIPOS_DOCUMENTO_LOCTP.some((t) => t.valor === v);
}

export function esUnidadLoctp(v: unknown): v is UnidadLoctp {
  return UNIDADES_LOCTP.some((u) => u.valor === v);
}

/**
 * La unidad como la escribe el formato. El libro la guarda "m3" (sin superíndice,
 * para no depender del encoding en la base) y el documento la imprime "m³". Vive
 * acá para que la pantalla y el Excel muestren la misma etiqueta.
 */
export function unidadOficial(u: string | null | undefined): string {
  const v = (u ?? "").trim().toLowerCase();
  if (!v) return "m³";
  if (v === "m3" || v === "m³") return "m³";
  if (v === "unidad" || v === "und" || v === "u") return "Unidad";
  if (v === "kg") return "kg";
  if (v === "tonelada" || v === "t") return "Tonelada";
  if (v === "pt") return "pt";
  return u ?? "m³";
}

/** Un casillero del formato: su número, su nombre y con qué campo se llena. */
export interface ColumnaLoctp {
  col: number;
  campo: string;
  label: string;
  obligatorio: boolean;
}

/**
 * SECCIÓN 1: INGRESOS — 13 casilleros.
 *
 * (9) es el código con el que el producto salió de la fuente de origen (para
 * trozas, el del bosque); (10) es el código que ESTE centro le asigna al entrar
 * y marca físicamente sobre la madera. Son dos códigos distintos y la guía
 * permite omitir uno cuando existe el otro — por eso ninguno es obligatorio.
 */
export const SECCION_1_INGRESOS: readonly ColumnaLoctp[] = [
  { col: 1, campo: "libroNro", label: "N° de registro", obligatorio: true },
  { col: 2, campo: "entryDate", label: "Fecha de ingreso", obligatorio: true },
  { col: 3, campo: "docType", label: "Tipo de documento", obligatorio: true },
  { col: 4, campo: "gtfNumber", label: "N° de documento", obligatorio: true },
  { col: 5, campo: "originSourceNumber", label: "N° de fuente de origen/procedencia", obligatorio: true },
  { col: 6, campo: "productType", label: "Tipo de producto", obligatorio: true },
  { col: 7, campo: "speciesCommonName", label: "Nombre común de la especie", obligatorio: true },
  { col: 8, campo: "speciesScientificName", label: "Nombre científico", obligatorio: true },
  { col: 9, campo: "originCode", label: "Código de origen/procedencia", obligatorio: false },
  { col: 10, campo: "ctpProductCode", label: "Código que asigna el CTP", obligatorio: false },
  { col: 11, campo: "unit", label: "Unidad de medida", obligatorio: true },
  { col: 12, campo: "volumeM3", label: "Cantidad", obligatorio: true },
  { col: 13, campo: "notes", label: "Observaciones", obligatorio: false },
] as const;

/**
 * SECCIÓN 2: CONSUMOS — 11 casilleros. En el código un consumo no es una fila
 * propia sino el puente `ForestCtpConsumo` (ingreso → corrida), así que sus
 * casilleros se derivan del ingreso consumido y de la corrida destino.
 */
export const SECCION_2_CONSUMOS: readonly ColumnaLoctp[] = [
  { col: 1, campo: "nro", label: "N° de registro", obligatorio: true },
  { col: 2, campo: "fecha", label: "Fecha de consumo", obligatorio: true },
  { col: 3, campo: "productType", label: "Tipo de producto", obligatorio: true },
  { col: 4, campo: "speciesCommon", label: "Nombre común de la especie", obligatorio: true },
  { col: 5, campo: "speciesScientific", label: "Nombre científico", obligatorio: true },
  { col: 6, campo: "codigoOrigen", label: "Código de origen/procedencia/CTP/retrozado", obligatorio: false },
  { col: 7, campo: "fuenteOrigen", label: "N° de fuente de origen/procedencia", obligatorio: false },
  { col: 8, campo: "unit", label: "Unidad de medida", obligatorio: true },
  { col: 9, campo: "cantidad", label: "Cantidad consumida", obligatorio: true },
  { col: 10, campo: "lote", label: "N° de lote consumido", obligatorio: false },
  { col: 11, campo: "observaciones", label: "Observaciones", obligatorio: false },
] as const;

/**
 * SECCIÓN 3: PRODUCCIÓN — 9 casilleros. Ojo: NO lleva columnas de origen. La
 * trazabilidad hacia atrás la da la Sección 2 (Consumos) y el número de lote,
 * que es exactamente por qué en el código el origen de una corrida se deriva del
 * puente de consumos en vez de copiarse en la fila (ADR-311).
 */
export const SECCION_3_PRODUCCION: readonly ColumnaLoctp[] = [
  { col: 1, campo: "lineNo", label: "N° de registro", obligatorio: true },
  { col: 2, campo: "entryDate", label: "Fecha de producción", obligatorio: true },
  { col: 3, campo: "productType", label: "Tipo de producto", obligatorio: true },
  { col: 4, campo: "speciesCommon", label: "Nombre común de la especie", obligatorio: true },
  { col: 5, campo: "speciesScientific", label: "Nombre científico", obligatorio: true },
  { col: 6, campo: "unit", label: "Unidad de medida", obligatorio: true },
  { col: 7, campo: "quantity", label: "Cantidad producida", obligatorio: true },
  { col: 8, campo: "lote", label: "N° de lote", obligatorio: false },
  { col: 9, campo: "observations", label: "Observaciones", obligatorio: false },
] as const;

/**
 * SECCIÓN 4: SALIDAS — 12 casilleros.
 *
 * (8) el lote sólo va si el producto se obtuvo por producción acá; (9) el código
 * es opcional en general pero OBLIGATORIO para trozas y para lo que no se
 * produjo en este centro. La regla depende del producto, así que la marcamos
 * como no obligatoria y el aviso lo da el contexto, no una tilde ciega.
 */
export const SECCION_4_SALIDAS: readonly ColumnaLoctp[] = [
  { col: 1, campo: "lineNo", label: "N° de registro", obligatorio: true },
  { col: 2, campo: "entryDate", label: "Fecha de salida", obligatorio: true },
  { col: 3, campo: "docType", label: "Tipo de documento", obligatorio: true },
  { col: 4, campo: "gtfNumber", label: "N° de documento", obligatorio: true },
  { col: 5, campo: "productType", label: "Tipo de producto", obligatorio: true },
  { col: 6, campo: "speciesCommon", label: "Nombre común de la especie", obligatorio: true },
  { col: 7, campo: "speciesScientific", label: "Nombre científico", obligatorio: true },
  { col: 8, campo: "lote", label: "N° de lote", obligatorio: false },
  { col: 9, campo: "codigoProducto", label: "Código del producto", obligatorio: false },
  { col: 10, campo: "unit", label: "Unidad de medida", obligatorio: true },
  { col: 11, campo: "quantity", label: "Cantidad", obligatorio: true },
  { col: 12, campo: "observations", label: "Observaciones", obligatorio: false },
] as const;

/** Un campo que el formato exige y la fila no tiene. */
export interface CampoFaltante {
  col: number;
  campo: string;
  label: string;
}

/** Vacío = null, undefined, string en blanco o cantidad ≤ 0. */
function sinDato(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return !Number.isFinite(v) || v <= 0;
  return false;
}

function faltantes(
  columnas: readonly ColumnaLoctp[],
  fila: Record<string, unknown>,
): CampoFaltante[] {
  return columnas
    .filter((c) => c.obligatorio && sinDato(fila[c.campo]))
    .map(({ col, campo, label }) => ({ col, campo, label }));
}

/**
 * Qué le falta a un INGRESO (Sección 1) para el formato oficial.
 *
 * Nunca bloquea guardar: el libro admite huecos (que es lo que evita que el
 * operador invente un dato), el documento que se presenta no. Igual criterio que
 * `trazabilidadCompleta()` con el certificado.
 */
export function faltantesIngreso(fila: Record<string, unknown>): CampoFaltante[] {
  return faltantes(SECCION_1_INGRESOS, fila);
}

/**
 * Lo mismo, pero separando lo que BLOQUEA de lo que sólo completa.
 *
 * `faltantesIngreso()` devuelve únicamente los obligatorios —por eso el chip de
 * la tabla dice "faltan 2"— mientras el modal, que lista los campos vacíos de
 * cada bloque, muestra quince. Los dos tienen razón y juntos confunden: el
 * operador no sabe cuál de los dos números lo frena.
 *
 * Esta devuelve los dos grupos de la MISMA fuente para poder decirlo junto:
 * "faltan 2 para presentar, y 6 complementarios que no lo impiden".
 */
export function faltantesIngresoPorTipo(fila: Record<string, unknown>): {
  obligatorios: CampoFaltante[];
  opcionales: CampoFaltante[];
} {
  const vacios = SECCION_1_INGRESOS.filter((c) => sinDato(fila[c.campo]));
  const aCampo = ({ col, campo, label }: ColumnaLoctp): CampoFaltante => ({ col, campo, label });
  return {
    obligatorios: vacios.filter((c) => c.obligatorio).map(aCampo),
    opcionales: vacios.filter((c) => !c.obligatorio).map(aCampo),
  };
}

/** Qué le falta a una PRODUCCIÓN (Sección 3). */
export function faltantesProduccion(fila: Record<string, unknown>): CampoFaltante[] {
  return faltantes(SECCION_3_PRODUCCION, fila);
}

/** Qué le falta a una SALIDA (Sección 4). */
export function faltantesSalida(fila: Record<string, unknown>): CampoFaltante[] {
  return faltantes(SECCION_4_SALIDAS, fila);
}

/** Resumen para el chip: "listo" o los N campos que faltan, ya ordenados. */
export function resumenFaltantes(lista: CampoFaltante[]): string {
  if (lista.length === 0) return "Listo para el LO-CTP";
  const nombres = [...lista]
    .sort((a, b) => a.col - b.col)
    .map((c) => `(${c.col}) ${c.label}`);
  if (nombres.length <= 3) return `Falta ${nombres.join(", ")}`;
  return `Faltan ${nombres.length} campos: ${nombres.slice(0, 3).join(", ")}…`;
}
