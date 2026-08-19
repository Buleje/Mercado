/**
 * Los cinco formatos del Libro de Operaciones del CTP, tal como los emite el
 * SNIFFS.
 *
 * QUÉ PROBLEMA RESUELVE. El importador (ADR-138) nació leyendo el Excel de la
 * plantilla oficial, con sus cuatro hojas. Pero lo que un aserradero tiene a
 * mano es OTRA cosa: el reporte que el propio SNIFFS le devuelve en pantalla y
 * exporta a Excel, con las columnas del formato impreso —«N° de fuente de
 * Origen / Procedencia», «Codigo de CTP», «Codigo de Origen / Procedencia / CTP
 * o Retrozado»— que no son las mismas cabeceras ni el mismo orden.
 *
 * Además faltaban dos registros enteros: **Consumos** (Sección 2) y
 * **Retrozado** (Apartado 2), que el SNIFFS exporta por separado y hasta ahora
 * sólo se podían cargar a mano fila por fila.
 *
 * CÓMO. Cada formato se declara como DATO: sus columnas, sus alias reales y
 * cuáles son obligatorias. El parser no sabe de formatos concretos — recorre
 * esta tabla. Agregar una variante de cabecera es agregar un string, no tocar
 * lógica.
 *
 * PURO: recibe cabeceras y filas ya leídas. Sin ExcelJS ni React, porque
 * decidir qué columna es cuál es la parte que hay que poder probar.
 */

import { normalizarCabecera } from "./ctp-import-mapeo";

/** Los cinco registros del libro, con su nombre oficial en el formato. */
export const FORMATOS = [
  "ingresos",
  "consumos",
  "retrozado",
  "produccion",
  "salidas",
  /* Los dos inventarios NO son secciones del libro: son la foto de lo que hay
     hoy en el patio y en el depósito. El libro cuenta la historia (qué entró,
     qué se aserró); el inventario dice con qué se arranca. Sin ellos, importar
     un libro que empieza a mitad deja el saldo en negativo porque nadie declaró
     la existencia de apertura. */
  "inventarioTrozas",
  "inventarioAserrada",
] as const;
export type FormatoCtp = (typeof FORMATOS)[number];

/** Las cinco secciones del Libro de Operaciones — sin los inventarios. */
export const FORMATOS_LIBRO = ["ingresos", "consumos", "retrozado", "produccion", "salidas"] as const;
export type FormatoLibro = (typeof FORMATOS_LIBRO)[number];

/** Los dos inventarios de existencia, que no son registros del libro. */
export const FORMATOS_INVENTARIO = ["inventarioTrozas", "inventarioAserrada"] as const;
export type FormatoInventario = (typeof FORMATOS_INVENTARIO)[number];

/** ¿Es una foto de existencia y no un movimiento del libro? */
export const esInventario = (f: FormatoCtp): f is FormatoInventario =>
  f === "inventarioTrozas" || f === "inventarioAserrada";

export const TITULO_FORMATO: Record<FormatoCtp, string> = {
  ingresos: "Sección 1 · Ingresos",
  consumos: "Sección 2 · Consumos",
  retrozado: "Apartado 2 · Retrozado",
  produccion: "Sección 3 · Producción",
  salidas: "Sección 4 · Salidas",
  inventarioTrozas: "Inventario · Rolliza en patio",
  inventarioAserrada: "Inventario · Aserrada en depósito",
};

export interface ColumnaFormato {
  /** Clave con la que sale el dato ya parseado. */
  clave: string;
  /** Cómo se llama en el formato impreso. */
  label: string;
  /**
   * Sin ella la fila no sirve. Se valida ANTES de escribir nada: un archivo al
   * que le falta la especie entraría entero con la columna vacía y habría que
   * rehacerlo a mano.
   */
  requerida: boolean;
  /**
   * Variantes reales de la cabecera, de la MÁS específica a la más genérica.
   * El orden importa: «codigo de origen procedencia ctp o retrozado» tiene que
   * ganar sobre «codigo de origen» aunque la segunda esté antes en la fila.
   */
  alias: string[];
  tipo: "texto" | "fecha" | "numero";
}

/**
 * Sección 1 · INGRESOS.
 *
 * Dos códigos DISTINTOS que es fácil confundir: «Codigo de Origen / Procedencia»
 * es el del árbol en el título habilitante (33/B (0000010)) y «Codigo de CTP» es
 * el que este centro le pone a la pieza al recibirla (3012263). Mezclarlos rompe
 * la trazabilidad justo donde OSINFOR la mira.
 */
const COLUMNAS_INGRESOS: ColumnaFormato[] = [
  { clave: "numero", label: "N°", requerida: false, alias: ["n"], tipo: "numero" },
  { clave: "fecha", label: "Fecha", requerida: true, alias: ["fecha"], tipo: "fecha" },
  { clave: "tipoDocumento", label: "Tipo de Documento", requerida: false, alias: ["tipo de documento"], tipo: "texto" },
  { clave: "numeroDocumento", label: "N° de Documento", requerida: true, alias: ["n de documento", "numero de documento", "documento"], tipo: "texto" },
  { clave: "fuenteOrigen", label: "N° de fuente de Origen / Procedencia", requerida: false, alias: ["n de fuente de origen", "fuente de origen", "fuente origen"], tipo: "texto" },
  { clave: "tipoProducto", label: "Tipo de Producto", requerida: false, alias: ["tipo de producto"], tipo: "texto" },
  { clave: "especieComun", label: "Nombre Común", requerida: true, alias: ["nombre comun"], tipo: "texto" },
  { clave: "especieCientifica", label: "Nombre Científico", requerida: false, alias: ["nombre cientifico"], tipo: "texto" },
  { clave: "codigoOrigen", label: "Código de Origen / Procedencia", requerida: false, alias: ["codigo de origen procedencia", "codigo de origen"], tipo: "texto" },
  { clave: "codigoCtp", label: "Código de CTP", requerida: false, alias: ["codigo de ctp"], tipo: "texto" },
  { clave: "unidad", label: "Unidad de Medida", requerida: false, alias: ["unidad de medida", "unidad medida", "unidad"], tipo: "texto" },
  { clave: "cantidad", label: "Cantidad", requerida: true, alias: ["cantidad"], tipo: "numero" },
  { clave: "observaciones", label: "Observaciones", requerida: false, alias: ["observaciones"], tipo: "texto" },
];

/**
 * Sección 2 · CONSUMOS.
 *
 * El código de origen acá puede ser de tres cosas —procedencia, CTP o
 * retrozado— y viene en UNA sola columna: es la que dice qué pieza se comió la
 * sierra. Sin ella el consumo no se puede atribuir a ningún ingreso, que es
 * justamente la invariante I2.
 */
const COLUMNAS_CONSUMOS: ColumnaFormato[] = [
  { clave: "numero", label: "N°", requerida: false, alias: ["n"], tipo: "numero" },
  { clave: "fecha", label: "Fecha", requerida: true, alias: ["fecha"], tipo: "fecha" },
  { clave: "tipoProducto", label: "Tipo de Producto", requerida: false, alias: ["tipo de producto"], tipo: "texto" },
  { clave: "especieComun", label: "Nombre Común", requerida: true, alias: ["nombre comun"], tipo: "texto" },
  { clave: "especieCientifica", label: "Nombre Científico", requerida: false, alias: ["nombre cientifico"], tipo: "texto" },
  {
    clave: "codigoOrigen",
    label: "Código de Origen / Procedencia / CTP o Retrozado",
    requerida: true,
    alias: ["codigo de origen procedencia ctp o retrozado", "codigo de origen procedencia ctp", "codigo de origen", "codigo"],
    tipo: "texto",
  },
  { clave: "fuenteOrigen", label: "N° Fuente Origen / Procedencia", requerida: false, alias: ["n fuente origen", "fuente origen"], tipo: "texto" },
  { clave: "unidad", label: "Unidad de medida", requerida: false, alias: ["unidad de medida", "unidad"], tipo: "texto" },
  { clave: "cantidad", label: "Cantidad", requerida: true, alias: ["cantidad"], tipo: "numero" },
  { clave: "lote", label: "Lote", requerida: false, alias: ["lote"], tipo: "texto" },
  { clave: "observaciones", label: "Observaciones", requerida: false, alias: ["observaciones"], tipo: "texto" },
];

/**
 * Apartado 2 · RETROZADO.
 *
 * La única sección sin columna «N°». Trae los DOS diámetros porque el tronco es
 * cónico y las reglas del corte (ADR-313) necesitan el mayor: con el promedio
 * solo, una troza de 73→58 parece de 65.5 y rechaza cortes válidos.
 */
const COLUMNAS_RETROZADO: ColumnaFormato[] = [
  { clave: "fecha", label: "Fecha", requerida: true, alias: ["fecha"], tipo: "fecha" },
  {
    clave: "codigoMadre",
    label: "Código de Origen / Procedencia / CTP",
    requerida: true,
    alias: ["codigo de origen procedencia ctp", "codigo de origen procedencia", "codigo de origen"],
    tipo: "texto",
  },
  { clave: "volumenInicial", label: "Volumen Inicial (m3)", requerida: false, alias: ["volumen inicial"], tipo: "numero" },
  { clave: "codigoRetrozo", label: "Código de Retrozado", requerida: true, alias: ["codigo de retrozado", "codigo retrozado"], tipo: "texto" },
  { clave: "especieComun", label: "Nombre Común", requerida: false, alias: ["nombre comun"], tipo: "texto" },
  { clave: "especieCientifica", label: "Nombre Científico", requerida: false, alias: ["nombre cientifico"], tipo: "texto" },
  { clave: "diametroMayor", label: "Diámetro Mayor (m)", requerida: false, alias: ["diametro mayor"], tipo: "numero" },
  { clave: "diametroMenor", label: "Diámetro Menor (m)", requerida: false, alias: ["diametro menor"], tipo: "numero" },
  { clave: "longitud", label: "Longitud (m)", requerida: false, alias: ["longitud"], tipo: "numero" },
  { clave: "volumenFinal", label: "Volumen Final (m3)", requerida: true, alias: ["volumen final"], tipo: "numero" },
  { clave: "observaciones", label: "Observaciones", requerida: false, alias: ["observaciones"], tipo: "texto" },
];

/** Sección 3 · PRODUCCIÓN. Lo que sale de la sierra, por lote. */
const COLUMNAS_PRODUCCION: ColumnaFormato[] = [
  { clave: "numero", label: "N°", requerida: false, alias: ["n"], tipo: "numero" },
  { clave: "fecha", label: "Fecha", requerida: true, alias: ["fecha"], tipo: "fecha" },
  { clave: "tipoProducto", label: "Tipo de Producto", requerida: true, alias: ["tipo de producto"], tipo: "texto" },
  { clave: "especieComun", label: "Nombre Común", requerida: true, alias: ["nombre comun"], tipo: "texto" },
  { clave: "especieCientifica", label: "Nombre Científico", requerida: false, alias: ["nombre cientifico"], tipo: "texto" },
  { clave: "unidad", label: "Unidad Medida", requerida: false, alias: ["unidad medida", "unidad de medida", "unidad"], tipo: "texto" },
  { clave: "cantidad", label: "Cantidad", requerida: true, alias: ["cantidad"], tipo: "numero" },
  { clave: "lote", label: "Lote", requerida: false, alias: ["lote"], tipo: "texto" },
  { clave: "observaciones", label: "Observaciones", requerida: false, alias: ["observaciones"], tipo: "texto" },
];

/**
 * Sección 4 · SALIDAS.
 *
 * «Codigo» acá NO es el de origen: es el código del producto despachado (MA2,
 * GF123). El origen de una salida no viaja en el formato — se reconstruye
 * después contra la producción, y por eso el importador crea el despacho sin
 * atribuir en vez de inventarle una corrida.
 */
const COLUMNAS_SALIDAS: ColumnaFormato[] = [
  { clave: "numero", label: "N°", requerida: false, alias: ["n"], tipo: "numero" },
  { clave: "fecha", label: "Fecha", requerida: true, alias: ["fecha"], tipo: "fecha" },
  { clave: "tipoDocumento", label: "Tipo de Documento", requerida: false, alias: ["tipo de documento"], tipo: "texto" },
  { clave: "numeroDocumento", label: "N° de Documento", requerida: true, alias: ["n de documento", "numero de documento", "documento"], tipo: "texto" },
  { clave: "tipoProducto", label: "Tipo de Producto", requerida: true, alias: ["tipo de producto"], tipo: "texto" },
  { clave: "especieComun", label: "Nombre Común", requerida: true, alias: ["nombre comun"], tipo: "texto" },
  { clave: "especieCientifica", label: "Nombre Científico", requerida: false, alias: ["nombre cientifico"], tipo: "texto" },
  { clave: "lote", label: "Lote", requerida: false, alias: ["lote"], tipo: "texto" },
  { clave: "codigoProducto", label: "Código", requerida: false, alias: ["codigo"], tipo: "texto" },
  { clave: "unidad", label: "Unidad de Medida", requerida: false, alias: ["unidad de medida", "unidad"], tipo: "texto" },
  { clave: "cantidad", label: "Cantidad", requerida: true, alias: ["cantidad"], tipo: "numero" },
  { clave: "observaciones", label: "Observaciones", requerida: false, alias: ["observaciones"], tipo: "texto" },
];

/**
 * Inventario de TROZAS: lo que hay hoy en el patio, pieza por pieza.
 *
 * Cada fila es una troza con su código de planta y su volumen ya calculado. El
 * espesor y el ancho son los dos diámetros —el formato los llama así— y el
 * volumen que trae el archivo MANDA: lo midió quien la cubicó.
 */
const COLUMNAS_INV_TROZAS: ColumnaFormato[] = [
  { clave: "contrato", label: "Contrato", requerida: false, alias: ["contrato"], tipo: "texto" },
  { clave: "resolucion", label: "Número Resolución", requerida: false, alias: ["numero resolucion", "n resolucion"], tipo: "texto" },
  { clave: "tipoDocumento", label: "Documento de Ingreso", requerida: false, alias: ["documento de ingreso"], tipo: "texto" },
  { clave: "numeroDocumento", label: "N° GTF", requerida: false, alias: ["n gtf", "gtf"], tipo: "texto" },
  /* La madre, cuando la troza es un retrozo. Es lo que permite reconstruir el
     corte sin tener el Apartado 2 a mano. */
  { clave: "trozaPadre", label: "Troza Padre", requerida: false, alias: ["troza padre"], tipo: "texto" },
  { clave: "codigoTroza", label: "Código Troza", requerida: false, alias: ["codigo troza"], tipo: "texto" },
  { clave: "codigoPlanta", label: "Código Planta", requerida: true, alias: ["codigo planta"], tipo: "texto" },
  { clave: "especie", label: "Especie", requerida: true, alias: ["especie"], tipo: "texto" },
  { clave: "d1Cm", label: "D1(cm)", requerida: false, alias: ["d1"], tipo: "numero" },
  { clave: "d2Cm", label: "D2(cm)", requerida: false, alias: ["d2"], tipo: "numero" },
  { clave: "largoM", label: "Largo(m)", requerida: false, alias: ["largo"], tipo: "numero" },
  { clave: "volumenM3", label: "Volumen", requerida: true, alias: ["volumen"], tipo: "numero" },
  { clave: "tipoProducto", label: "Tipo de Producto", requerida: false, alias: ["tipo de producto", "producto"], tipo: "texto" },
  /* «En Stock» es lo que hace que esta troza cuente como disponible. Una que ya
     se consumió o se despachó sigue en la lista pero NO es existencia. */
  { clave: "estado", label: "Estado Actual", requerida: false, alias: ["estado actual", "estado"], tipo: "texto" },
  { clave: "fechaEstado", label: "Fecha del Estado", requerida: false, alias: ["fecha del estado"], tipo: "texto" },
];

/**
 * Inventario de ASERRADA: los paquetes que hay hoy en el depósito.
 *
 * Trae dos volúmenes —pies tablares y m³— y se usa el de m³, que es la unidad
 * del libro. La columna «Consumo Interno» marca el paquete que ya está apartado
 * para usar adentro: sigue en el depósito, pero no se va a vender.
 */
const COLUMNAS_INV_ASERRADA: ColumnaFormato[] = [
  { clave: "numeroDocumento", label: "GTF Origen", requerida: false, alias: ["gtf origen", "gtf"], tipo: "texto" },
  { clave: "fecha", label: "Fecha Producción", requerida: false, alias: ["fecha produccion", "fecha"], tipo: "fecha" },
  { clave: "lote", label: "Lote", requerida: false, alias: ["lote"], tipo: "texto" },
  { clave: "linea", label: "Línea", requerida: false, alias: ["linea"], tipo: "texto" },
  { clave: "paquete", label: "Paquete", requerida: false, alias: ["paquete"], tipo: "texto" },
  { clave: "especie", label: "Especie", requerida: true, alias: ["especie"], tipo: "texto" },
  { clave: "tipoProducto", label: "Producto", requerida: true, alias: ["producto"], tipo: "texto" },
  { clave: "dimensiones", label: "Dimensiones", requerida: false, alias: ["dimensiones"], tipo: "texto" },
  { clave: "unidadesDimension", label: "Espesor X Ancho X Largo", requerida: false, alias: ["espesor x ancho x largo"], tipo: "texto" },
  { clave: "cantidad", label: "Cantidad", requerida: false, alias: ["cantidad"], tipo: "numero" },
  { clave: "presentacion", label: "Presentación", requerida: false, alias: ["presentacion"], tipo: "texto" },
  { clave: "volumenPt", label: "Volumen(pt)", requerida: false, alias: ["volumen pt", "volumenpt"], tipo: "numero" },
  { clave: "volumenM3", label: "Volumen(m3)", requerida: true, alias: ["volumen m3", "volumenm3"], tipo: "numero" },
  { clave: "unidad", label: "Medida", requerida: false, alias: ["medida"], tipo: "texto" },
  { clave: "consumoInterno", label: "Consumo Interno", requerida: false, alias: ["consumo interno"], tipo: "texto" },
];

export const COLUMNAS_POR_FORMATO: Record<FormatoCtp, ColumnaFormato[]> = {
  inventarioTrozas: COLUMNAS_INV_TROZAS,
  inventarioAserrada: COLUMNAS_INV_ASERRADA,
  ingresos: COLUMNAS_INGRESOS,
  consumos: COLUMNAS_CONSUMOS,
  retrozado: COLUMNAS_RETROZADO,
  produccion: COLUMNAS_PRODUCCION,
  salidas: COLUMNAS_SALIDAS,
};

// ── Detección de columnas ────────────────────────────────────────────────────

/** Qué columna del archivo (índice 0-based) corresponde a cada clave. */
export type MapeoFormato = Record<string, number | null>;

/**
 * Empareja las cabeceras del archivo con las columnas del formato.
 *
 * Dos reglas que salen de errores reales:
 *  · el alias se prueba de más específico a más genérico y en TODAS las columnas
 *    antes de pasar al siguiente — si no, «codigo de origen» se lleva la columna
 *    de «codigo de origen / procedencia / CTP o retrozado»;
 *  · una columna no se asigna dos veces: con «Nombre Común» y «Nombre
 *    Científico» juntos, el genérico «nombre» no puede robarse el que ya tomó el
 *    específico.
 */
export function detectarColumnas(formato: FormatoCtp, cabeceras: readonly unknown[]): MapeoFormato {
  const norm = cabeceras.map((h) => normalizarCabecera(h));
  const mapeo: MapeoFormato = {};
  const usadas = new Set<number>();

  for (const col of COLUMNAS_POR_FORMATO[formato]) mapeo[col.clave] = null;

  /* Los alias más largos primero: son los más específicos, y el que gana la
     columna es el que la describe mejor, no el que aparece antes en la tabla. */
  const porEspecificidad = [...COLUMNAS_POR_FORMATO[formato]].sort(
    (a, b) => Math.max(...b.alias.map((x) => x.length)) - Math.max(...a.alias.map((x) => x.length)),
  );

  for (const col of porEspecificidad) {
    for (const alias of col.alias) {
      let hallada: number | null = null;
      for (let i = 0; i < norm.length; i++) {
        if (!norm[i] || usadas.has(i)) continue;
        /* Igualdad exacta primero: «n» como alias de la columna «N°» no puede
           matchear «nombre comun» por inclusión. */
        if (norm[i] === alias) { hallada = i; break; }
      }
      if (hallada == null) {
        for (let i = 0; i < norm.length; i++) {
          if (!norm[i] || usadas.has(i)) continue;
          if (norm[i].includes(alias)) { hallada = i; break; }
        }
      }
      if (hallada != null) {
        mapeo[col.clave] = hallada;
        usadas.add(hallada);
        break;
      }
    }
  }
  return mapeo;
}

/** Las columnas obligatorias que quedaron sin emparejar. */
export function columnasFaltantes(formato: FormatoCtp, mapeo: MapeoFormato): ColumnaFormato[] {
  return COLUMNAS_POR_FORMATO[formato].filter((c) => c.requerida && mapeo[c.clave] == null);
}

/**
 * La huella de cada formato: qué columnas tiene que traer y cuáles NO puede.
 *
 * Puntuar «cuántas columnas coinciden» no alcanza porque los cinco comparten
 * fecha, especie, cantidad y observaciones, y varias cabeceras se matchean
 * entre sí por inclusión («Codigo» está dentro de «Codigo de CTP»). Lo que de
 * verdad los separa son PRESENCIAS Y AUSENCIAS:
 *
 *  · Ingresos y Salidas son los únicos con «Tipo de Documento» — y entre ellos,
 *    sólo Salidas trae «Lote».
 *  · Consumos tiene el código triple «…CTP o Retrozado» y ningún documento.
 *  · Retrozado es el único con «Volumen Inicial» y «Codigo de Retrozado».
 *  · Producción es el más chico: se define por lo que NO tiene.
 */
const FIRMAS: Record<FormatoCtp, { debe: string[]; noDebe: string[] }> = {
  /* Los dos inventarios se prueban PRIMERO: son inconfundibles por sus columnas
     propias («codigo planta», «volumen m3» + «paquete») y ninguna sección del
     libro las tiene. Probarlos después dejaría que una firma más laxa se los
     quedara. */
  inventarioTrozas: { debe: ["codigo planta", "volumen"], noDebe: ["lote", "paquete"] },
  inventarioAserrada: { debe: ["volumen m3", "paquete"], noDebe: [] },
  retrozado: { debe: ["codigo de retrozado", "volumen final"], noDebe: [] },
  /* La frase corta, no la larga: el SNIFFS titula la columna «… / CTP o
     Retrozado» pero muchos exports la abrevian, y exigir el texto completo
     dejaba la sección sin reconocer. Retrozado se prueba antes y se queda con
     los archivos que sí lo son, así que la forma corta no los confunde. */
  consumos: { debe: ["codigo de origen procedencia ctp"], noDebe: ["tipo de documento"] },
  salidas: { debe: ["tipo de documento", "lote"], noDebe: ["codigo de ctp"] },
  ingresos: { debe: ["tipo de documento"], noDebe: ["lote"] },
  produccion: { debe: ["tipo de producto", "cantidad"], noDebe: ["tipo de documento", "codigo", "lote de origen"] },
};

const tiene = (norm: readonly string[], alias: string) => norm.some((h) => h === alias || h.includes(alias));

/**
 * Qué formato es este archivo, mirando sus cabeceras.
 *
 * Se prueban las firmas en orden de especificidad: Retrozado y Consumos son
 * inconfundibles, Salidas e Ingresos se separan por «Lote», y Producción queda
 * al final porque es el que más falsos positivos daría si se probara antes.
 */
export function detectarFormato(cabeceras: readonly unknown[]): { formato: FormatoCtp; confianza: number } | null {
  const norm = cabeceras.map((h) => normalizarCabecera(h)).filter(Boolean);
  if (norm.length === 0) return null;

  for (const formato of [
    "inventarioTrozas",
    "inventarioAserrada",
    "retrozado",
    "consumos",
    "salidas",
    "ingresos",
    "produccion",
  ] as const) {
    const firma = FIRMAS[formato];
    if (!firma.debe.every((a) => tiene(norm, a))) continue;
    if (firma.noDebe.some((a) => tiene(norm, a))) continue;

    /* Además de la firma, tienen que estar TODAS las obligatorias: una firma
       sola no garantiza que el archivo se pueda importar. */
    const cols = COLUMNAS_POR_FORMATO[formato];
    const obligatoriasOk = cols
      .filter((c) => c.requerida)
      .every((c) => c.alias.some((a) => tiene(norm, a)));
    if (!obligatoriasOk) continue;

    /* Cuántas de sus columnas aparecen: sirve para avisar cuando el archivo es
       del formato pero le faltan columnas opcionales. */
    const presentes = cols.filter((c) => c.alias.some((a) => tiene(norm, a))).length;
    return { formato, confianza: Math.round((presentes / cols.length) * 100) / 100 };
  }
  return null;
}

// ── Lectura de valores ───────────────────────────────────────────────────────

/**
 * Una fecha del formato, en `YYYY-MM-DD`.
 *
 * El SNIFFS la imprime `DD/MM/YYYY`; Excel a veces la entrega como Date. Se
 * normaliza a día sin hora porque `entryDate` es date-only y meterle zona
 * horaria corre el día en Lima (bug conocido del módulo).
 */
export function leerFecha(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}

/**
 * Un número del formato.
 *
 * Acepta el separador de miles con coma o punto: el SNIFFS imprime «3.010» para
 * 3,010 m³ y una planilla peruana escribe «1,234.56». Se decide por la posición
 * del ÚLTIMO separador, que es el decimal.
 */
export type ConvencionDecimal = "auto" | "coma-decimal";

/**
 * Un número del formato.
 *
 * @param convencion `"coma-decimal"` cuando la COLUMNA ya demostró que su coma
 *   es el separador decimal (ver `convencionDeColumna`). Sin eso, «2,762» se lee
 *   como 2762 y una troza de 2,762 m³ entra al patio con **2762 m³** — mil veces
 *   la madera que existe. Lo tira el volumen, que es el que trae 3 decimales.
 */
export function leerNumero(v: unknown, convencion: ConvencionDecimal = "auto"): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, "");
  if (!s) return null;
  const ultimaComa = s.lastIndexOf(",");
  const ultimoPunto = s.lastIndexOf(".");
  if (ultimaComa > -1 && ultimoPunto > -1) {
    /* El separador decimal es el que está más a la derecha; el otro es miles. */
    if (ultimaComa > ultimoPunto) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (ultimaComa > -1) {
    s = convencion === "coma-decimal"
      ? s.replace(",", ".")
      /* Sola y sin contexto: decimal si deja 1-2 dígitos («0,5»), miles si deja 3 («1,234»). */
      : s.length - ultimaComa - 1 === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * ¿La coma de ESTA columna es el separador decimal?
 *
 * Se decide mirando la columna entera, no valor por valor: «2,762» solo es
 * ambiguo, pero en una columna que también trae «3,1» o «0,719» la coma no puede
 * ser de miles. Es el mismo criterio que ya usa el CSV para el separador —
 * decidirlo una vez con toda la evidencia— aplicado a los decimales.
 *
 * Sin evidencia se devuelve `"auto"`: una columna de pie tablar con «1,234» y
 * «12,000» sigue leyéndose como miles, que es lo correcto ahí.
 */
export function convencionDeColumna(filas: readonly (readonly unknown[])[], indice: number): ConvencionDecimal {
  for (const fila of filas) {
    const s = String(fila?.[indice] ?? "").trim();
    if (!s || s.includes(".")) continue;
    /* Una coma que deja 1 o 2 dígitos sólo puede ser decimal («3,1», «2,73»). */
    if (/^\d+,\d{1,2}$/.test(s)) return "coma-decimal";
    /* Y nadie escribe un millar con un cero adelante: «0,719» es 0,719. */
    if (/^0,\d+$/.test(s)) return "coma-decimal";
  }
  return "auto";
}

export function leerTexto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export type FilaParseada = {
  /** Fila del Excel, 1-based, como la ve el operador. */
  fila: number;
  datos: Record<string, string | number | null>;
  /** Qué le falta a ESTA fila para poder importarse. */
  problemas: string[];
};

/**
 * Convierte las filas crudas en datos tipados, marcando los problemas por fila.
 *
 * Una fila con problemas NO frena el archivo: se reporta y el resto sigue. Un
 * import que aborta entero por una celda mal escrita obliga a rehacer el trabajo
 * de las otras doscientas.
 */
/**
 * ¿Es el pie del reporte y no una fila de datos?
 *
 * Se reconoce por la forma, no por el texto: una celda combinada se expande con
 * el MISMO valor en todas las columnas, y ninguna fila real del libro repite su
 * fecha en la columna de la especie. El texto se usa sólo como confirmación.
 */
/**
 * ¿Es la fila de TOTAL que cierra un inventario?
 *
 * Los dos inventarios terminan con una fila que repite la suma de la columna de
 * volumen y deja vacías las que identifican la pieza. No es un dato incompleto
 * que el operador pueda arreglar —no existe esa troza— así que reportarla como
 * «1 incompleta» manda a buscar un error que no está.
 *
 * Se reconoce por la forma: hay número pero no hay a QUÉ pertenece.
 */
export function esFilaDeTotal(
  formato: FormatoCtp,
  datos: Record<string, string | number | null>,
): boolean {
  if (formato !== "inventarioTrozas" && formato !== "inventarioAserrada") return false;
  const vacio = (v: unknown) => v == null || String(v).trim() === "";
  /* Sin especie NO es una pieza del inventario: es el pie de la tabla. */
  return vacio(datos.especie) && (vacio(datos.codigoPlanta) || vacio(datos.tipoProducto));
}

export function esPieDelReporte(fila: readonly unknown[] | undefined): boolean {
  if (!fila) return false;
  const llenas = fila.map((c) => (c == null ? "" : String(c).trim())).filter(Boolean);
  if (llenas.length < 3) return false;
  const todasIguales = llenas.every((v) => v === llenas[0]);
  return todasIguales && /detalle de observaciones/i.test(llenas[0]);
}

export function parsearFilas(
  formato: FormatoCtp,
  mapeo: MapeoFormato,
  filas: readonly (readonly unknown[])[],
  /** Fila del Excel en la que empiezan los datos (1-based). */
  filaInicial = 2,
): FilaParseada[] {
  const cols = COLUMNAS_POR_FORMATO[formato];
  const out: FilaParseada[] = [];

  /* La convención decimal se decide UNA vez por columna y con todas las filas a
     la vista: fila por fila, «2,762» es ambiguo y se leería como 2762. */
  const convenciones: Record<number, ConvencionDecimal> = {};
  for (const col of cols) {
    if (col.tipo !== "numero") continue;
    const idx = mapeo[col.clave];
    if (idx == null || convenciones[idx] != null) continue;
    convenciones[idx] = convencionDeColumna(filas, idx);
  }

  for (let i = 0; i < filas.length; i++) {
    const cruda = filas[i];
    /* El pie del reporte —«DETALLE DE OBSERVACIONES: C/I: Consumo Interno…»—
       viene como una celda combinada que ExcelJS expande repitiendo el mismo
       texto en toda la fila. No es un dato: sin esto, cada archivo del SNIFFS
       terminaba con una fila «incompleta» que el operador no podía arreglar
       porque no existe. */
    if (esPieDelReporte(cruda)) continue;
    const datos: Record<string, string | number | null> = {};
    const problemas: string[] = [];

    for (const col of cols) {
      const idx = mapeo[col.clave];
      const bruto = idx == null ? null : cruda[idx];
      const valor =
        col.tipo === "fecha"
          ? leerFecha(bruto)
          : col.tipo === "numero"
            ? leerNumero(bruto, idx == null ? "auto" : convenciones[idx] ?? "auto")
            : leerTexto(bruto);
      datos[col.clave] = valor;
      if (col.requerida && (valor == null || valor === "")) problemas.push(`Falta ${col.label}`);
    }

    /* Una fila totalmente vacía es el pie del reporte o una separadora, no un
       error: el SNIFFS deja filas en blanco y una nota de «DETALLE DE
       OBSERVACIONES» al final. */
    const vacia = Object.values(datos).every((v) => v == null || v === "");
    if (vacia) continue;

    /* La fila de TOTAL de un inventario tampoco es un dato: repite la suma sin
       decir de qué pieza. Descartarla evita el «1 incompleta» que manda al
       operador a buscar una troza que no existe. */
    if (esFilaDeTotal(formato, datos)) continue;

    out.push({ fila: filaInicial + i, datos, problemas });
  }
  return out;
}

/** Cuántas filas se pueden importar y cuántas no. */
export function resumirParseo(filas: readonly FilaParseada[]): { listas: number; conProblemas: number } {
  const conProblemas = filas.filter((f) => f.problemas.length > 0).length;
  return { listas: filas.length - conProblemas, conProblemas };
}
