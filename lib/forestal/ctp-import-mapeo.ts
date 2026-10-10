/**
 * ctp-import-mapeo — de las columnas del Excel del cliente a los campos del libro.
 *
 * El importador detecta las columnas por palabras clave y con el formato oficial
 * (RDE D000025-2023) acierta. Pero cada aserradero lleva su propia planilla:
 * "Guía", "N° Doc", "Titular del TH", "m3 recibidos"… y con una sola columna que
 * no matchea, el archivo entero entra con la GTF vacía y hay que rehacerlo a
 * mano. Con esto el operador ve el mapeo propuesto, lo corrige y recién importa.
 *
 * PURO: recibe cabeceras y filas ya leídas del Excel. Sin ExcelJS ni React —
 * decidir qué columna es cuál es la parte que hay que poder testear.
 */

/**
 * Normaliza una cabecera: minúsculas, sin acentos, sin puntuación. Vive acá y no
 * en `ctp-import` para que la dependencia vaya en una sola dirección (el parser
 * usa el mapeo, el mapeo no necesita el parser).
 */
export const normalizarCabecera = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Campos del registro de Ingresos que se pueden mapear. */
export type CampoIngreso =
  | "gtfNumber"
  | "entryDate"
  | "providerName"
  | "speciesCommonName"
  | "speciesScientificName"
  | "speciesCites"
  | "citesPermiso"
  | "productType"
  | "volumeM3"
  | "originCode"
  | "notes";

export interface DefinicionCampo {
  campo: CampoIngreso;
  label: string;
  /** Sin esto no hay ingreso válido: la UI lo marca y no deja importar. */
  requerido: boolean;
  /** Palabras clave por prioridad — la 1ª se prueba en TODAS las columnas antes
   *  de pasar a la 2ª (si no, "origen" gana sobre "código de origen"). */
  keywords: string[];
  hint?: string;
}

/**
 * Orden = orden de detección y de la UI. Es el single source: el parser
 * automático y el ajuste manual leen esta misma tabla.
 */
export const CAMPOS_INGRESO: DefinicionCampo[] = [
  { campo: "gtfNumber", label: "N° de GTF", requerido: true, keywords: ["n de documento", "n gtf", "gtf", "guia", "documento"], hint: "El origen legal de la madera" },
  { campo: "entryDate", label: "Fecha de ingreso", requerido: false, keywords: ["fecha de ingreso", "fecha ingreso", "fecha"] },
  { campo: "providerName", label: "Proveedor / titular", requerido: false, keywords: ["titular", "proveedor", "remitente"] },
  { campo: "speciesCommonName", label: "Especie", requerido: true, keywords: ["especie", "nombre comun"] },
  { campo: "speciesScientificName", label: "Nombre científico", requerido: false, keywords: ["cientifico"] },
  { campo: "speciesCites", label: "¿Es CITES?", requerido: false, keywords: ["cites"], hint: "Sí/No · X" },
  { campo: "citesPermiso", label: "N° permiso CITES", requerido: false, keywords: ["permiso cites", "n permiso"] },
  { campo: "productType", label: "Tipo de producto", requerido: false, keywords: ["tipo de producto", "producto"] },
  { campo: "volumeM3", label: "Volumen / cantidad", requerido: true, keywords: ["volumen", "cantidad", "m3"] },
  { campo: "originCode", label: "Código de origen", requerido: false, keywords: ["codigo de origen", "origen procedencia", "titulo habilitante", "origen"] },
  { campo: "notes", label: "Observaciones", requerido: false, keywords: ["observaciones", "notas"] },
];

/** Columna asignada a cada campo (índice 1-based de Excel) o null si ninguna. */
export type MapeoIngreso = Record<CampoIngreso, number | null>;

export const MAPEO_VACIO: MapeoIngreso = {
  gtfNumber: null,
  entryDate: null,
  providerName: null,
  speciesCommonName: null,
  speciesScientificName: null,
  speciesCites: null,
  citesPermiso: null,
  productType: null,
  volumeM3: null,
  originCode: null,
  notes: null,
};

/**
 * Propone un mapeo a partir de las cabeceras (índice 1-based, como ExcelJS).
 *
 * Reglas que vienen de errores reales:
 * · prioridad POR KEYWORD y no por columna — "código de origen" tiene que ganar
 *   sobre "n° fuente de origen" aunque esta esté antes;
 * · una columna no se asigna dos veces: si "cites" ya se llevó "N° permiso
 *   CITES", el booleano queda sin columna en vez de leer el permiso como Sí/No.
 */
export function detectarMapeo(cabeceras: (string | null | undefined)[]): MapeoIngreso {
  const norm = cabeceras.map((h) => normalizarCabecera(h));
  const mapeo: MapeoIngreso = { ...MAPEO_VACIO };
  const usadas = new Set<number>();

  // El permiso CITES se resuelve ANTES del booleano: las dos cabeceras contienen
  // "cites" y el permiso es la más específica.
  const orden = [...CAMPOS_INGRESO].sort((a, b) => {
    const pa = a.campo === "citesPermiso" ? 0 : a.campo === "speciesCites" ? 1 : 2;
    const pb = b.campo === "citesPermiso" ? 0 : b.campo === "speciesCites" ? 1 : 2;
    return pa - pb;
  });

  for (const def of orden) {
    for (const k of def.keywords) {
      let encontrada: number | null = null;
      for (let c = 1; c < norm.length; c++) {
        if (!norm[c] || usadas.has(c)) continue;
        if (norm[c].includes(k)) {
          encontrada = c;
          break;
        }
      }
      if (encontrada != null) {
        mapeo[def.campo] = encontrada;
        usadas.add(encontrada);
        break;
      }
    }
  }
  return mapeo;
}

/** Campos requeridos que quedaron sin columna: la UI no deja importar así. */
export function faltantesDelMapeo(mapeo: MapeoIngreso): DefinicionCampo[] {
  return CAMPOS_INGRESO.filter((d) => d.requerido && mapeo[d.campo] == null);
}

/** ¿El operador tocó el mapeo propuesto? (para avisar en la auditoría). */
export function mapeoModificado(propuesto: MapeoIngreso, actual: MapeoIngreso): boolean {
  return CAMPOS_INGRESO.some((d) => propuesto[d.campo] !== actual[d.campo]);
}

// ─── Duplicados dentro del MISMO archivo ────────────────────────────────────

export interface GrupoDuplicado {
  gtfNumber: string;
  /** Filas del Excel donde aparece (1-based, como las ve el operador). */
  filas: number[];
}

/**
 * GTF repetidas dentro del archivo. El preview del server ya avisa cuáles YA
 * están en el libro; esto es el otro caso, el que nadie miraba: el Excel que
 * trae la misma guía dos veces (copiar/pegar, o dos hojas pegadas). Sin esto,
 * la primera entra y la segunda dice "ya existe" — y el operador cree que el
 * libro estaba mal cuando el archivo era el del error.
 */
export function duplicadosEnArchivo(
  filas: { row: number; gtfNumber: string }[],
): GrupoDuplicado[] {
  const porGtf = new Map<string, number[]>();
  for (const f of filas) {
    const gtf = (f.gtfNumber ?? "").trim();
    if (!gtf) continue;
    porGtf.set(gtf, [...(porGtf.get(gtf) ?? []), f.row]);
  }
  return [...porGtf.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([gtfNumber, filas]) => ({ gtfNumber, filas }))
    .sort((a, b) => b.filas.length - a.filas.length);
}
