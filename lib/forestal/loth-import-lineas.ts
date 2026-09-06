/**
 * loth-import-lineas — leer un cuadro de Excel/CSV y decir, ANTES de escribir,
 * exactamente qué va a entrar al libro y qué no.
 *
 * La lección viene del importador del Libro CTP: de 60 trozas entraron 9 y las
 * 51 restantes se descartaron en silencio. Acá cada fila sale con veredicto
 * propio (`ok` | `error`) y su motivo, y el que descarta es el usuario mirando
 * la vista previa — nunca el parser por su cuenta.
 *
 * PURO y client-safe.
 */

import { smalianVolume, type LothSection } from "./loth-constants";

export interface FilaImport {
  /** Número de fila en el archivo (1 = primera fila de datos). */
  fila: number;
  treeCode: string | null;
  trozaCode: string | null;
  speciesCommon: string | null;
  entryDate: string | null;
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  volumeM3: number | null;
  productType: string | null;
  quantity: number | null;
  unit: string | null;
  gtfNumber: string | null;
  observations: string | null;
  /** Volumen calculado por Smalian cuando hay medidas y no vino volumen. */
  volumenCalculado: boolean;
  estado: "ok" | "error";
  motivos: string[];
}

export interface ResultadoImport {
  filas: FilaImport[];
  /** Cabecera detectada, en el orden del archivo. */
  columnas: string[];
  /** Columnas del archivo que no se supieron mapear (se ignoran, pero se avisan). */
  ignoradas: string[];
  listas: number;
  conError: number;
}

/** Alias aceptados por columna. Se comparan sin tildes, sin espacios y en minúscula. */
const ALIAS: Record<string, string[]> = {
  treeCode: ["codarbol", "codigoarbol", "arbol", "codigodelarbol", "nrodearbol"],
  trozaCode: ["codtroza", "codigotroza", "troza", "codigodetroza"],
  speciesCommon: ["especie", "nombrecomun", "especiecomun"],
  entryDate: ["fecha", "fechaactividad", "fecharegistro"],
  // «Ø mayor» normaliza a «mayor»: el símbolo Ø no sobrevive al filtro de
  // caracteres, así que el alias tiene que existir sin él.
  diamMayorM: ["omayor", "mayor", "diametromayor", "dmayor", "omay", "may", "diammayor"],
  diamMenorM: ["omenor", "menor", "diametromenor", "dmenor", "omen", "men", "diammenor"],
  lengthM: ["longitud", "largo", "long", "longitudm"],
  volumeM3: ["volumen", "volumenm3", "volm3", "vol"],
  productType: ["producto", "tipoproducto", "tipodeproducto"],
  quantity: ["cantidad", "qty"],
  unit: ["unidad", "und"],
  gtfNumber: ["gtf", "ngtf", "nrogtf", "numerogtf", "guia"],
  observations: ["observaciones", "obs", "observacion", "nota"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

function mapearColumna(header: string): string | null {
  const h = norm(header);
  for (const [campo, alias] of Object.entries(ALIAS)) {
    if (alias.includes(h)) return campo;
  }
  return null;
}

/** Separador del archivo: coma, punto y coma o tabulación (lo que más se repita). */
export function detectarSeparador(texto: string): string {
  const primera = texto.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const conteos = [
    { sep: "\t", n: (primera.match(/\t/g) ?? []).length },
    { sep: ";", n: (primera.match(/;/g) ?? []).length },
    { sep: ",", n: (primera.match(/,/g) ?? []).length },
  ];
  return conteos.sort((a, b) => b.n - a.n)[0].n > 0 ? conteos.sort((a, b) => b.n - a.n)[0].sep : ",";
}

/** Parte una línea respetando comillas dobles. */
function partir(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else enComillas = !enComillas;
    } else if (c === sep && !enComillas) {
      out.push(actual);
      actual = "";
    } else actual += c;
  }
  out.push(actual);
  return out.map((v) => v.trim());
}

/** Número con coma o punto decimal («1,25» y «1.25» son lo mismo en un Excel peruano). */
export function aNumero(v: string | null | undefined): number | null {
  if (v == null) return null;
  const limpio = v.replace(/\s/g, "").replace(/\./g, (m, i, s: string) => (s.lastIndexOf(".") === i && s.includes(",") ? "" : m));
  const conPunto = limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio;
  if (conPunto === "") return null;
  const n = Number(conPunto);
  return Number.isFinite(n) ? n : null;
}

/** Fecha en `YYYY-MM-DD`, `DD/MM/YYYY` o `DD-MM-YYYY` → ISO date-only. */
export function aFecha(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

/** Campos que cada sección necesita sí o sí para que la línea tenga sentido. */
const REQUERIDOS: Record<LothSection, string[]> = {
  tala: ["treeCode", "speciesCommon"],
  trozado: ["treeCode", "trozaCode", "speciesCommon"],
  despacho_troza: ["trozaCode", "gtfNumber"],
  consumo_troza: ["trozaCode"],
  producto_terminado: ["productType", "quantity"],
  despacho_producto: ["gtfNumber", "productType", "quantity"],
};

const ETIQUETA: Record<string, string> = {
  treeCode: "código de árbol",
  trozaCode: "código de troza",
  speciesCommon: "especie",
  gtfNumber: "N° de GTF",
  productType: "tipo de producto",
  quantity: "cantidad",
};

/**
 * Lee el texto pegado o el archivo y devuelve la vista previa.
 *
 * @param especiesAutorizadas si se pasa, avisa (no bloquea) cuando la especie
 *   de una fila no está en el POA: el libro admite el asiento, pero el despacho
 *   se va a rechazar después y es mejor saberlo antes de cargar 200 filas.
 */
export function parseImportLineas(
  texto: string,
  section: LothSection,
  opts: { especiesAutorizadas?: Set<string> } = {},
): ResultadoImport {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) {
    return { filas: [], columnas: [], ignoradas: [], listas: 0, conError: 0 };
  }

  const sep = detectarSeparador(texto);
  const headers = partir(lineas[0], sep);
  const mapa = headers.map(mapearColumna);
  const ignoradas = headers.filter((h, i) => mapa[i] == null && h.trim() !== "");

  const vistas = new Set<string>();
  const filas: FilaImport[] = lineas.slice(1).map((linea, idx) => {
    const celdas = partir(linea, sep);
    const val = (campo: string): string | null => {
      const i = mapa.indexOf(campo);
      const v = i >= 0 ? celdas[i] : null;
      return v && v.trim() !== "" ? v.trim() : null;
    };

    const diamMayorM = aNumero(val("diamMayorM"));
    const diamMenorM = aNumero(val("diamMenorM"));
    const lengthM = aNumero(val("lengthM"));
    let volumeM3 = aNumero(val("volumeM3"));
    let volumenCalculado = false;
    if (volumeM3 == null && diamMayorM && diamMenorM && lengthM) {
      volumeM3 = smalianVolume(diamMayorM, diamMenorM, lengthM);
      volumenCalculado = true;
    }

    const fila: FilaImport = {
      fila: idx + 1,
      treeCode: val("treeCode"),
      trozaCode: val("trozaCode"),
      speciesCommon: val("speciesCommon"),
      entryDate: aFecha(val("entryDate")),
      diamMayorM,
      diamMenorM,
      lengthM,
      volumeM3,
      productType: val("productType"),
      quantity: aNumero(val("quantity")),
      unit: val("unit"),
      gtfNumber: val("gtfNumber"),
      observations: val("observations"),
      volumenCalculado,
      estado: "ok",
      motivos: [],
    };

    for (const req of REQUERIDOS[section]) {
      if (fila[req as keyof FilaImport] == null) fila.motivos.push(`Falta ${ETIQUETA[req] ?? req}`);
    }
    if (val("entryDate") && !fila.entryDate) fila.motivos.push("Fecha ilegible (usá DD/MM/AAAA o AAAA-MM-DD)");
    if ((section === "tala" || section === "trozado") && !(fila.volumeM3 && fila.volumeM3 > 0)) {
      fila.motivos.push("Sin volumen: cargá Ø mayor, Ø menor y longitud, o el volumen directo");
    }
    // Duplicado DENTRO del archivo: se marca, no se descarta solo.
    const clave = fila.trozaCode ?? fila.treeCode;
    if (clave) {
      if (vistas.has(clave)) fila.motivos.push(`El código ${clave} se repite en el archivo`);
      vistas.add(clave);
    }
    if (opts.especiesAutorizadas && fila.speciesCommon && !opts.especiesAutorizadas.has(fila.speciesCommon)) {
      fila.motivos.push(`«${fila.speciesCommon}» no figura en el plan de manejo`);
    }

    // Sólo los faltantes duros invalidan: lo demás son avisos que el usuario lee.
    const duro = fila.motivos.some((m) => m.startsWith("Falta") || m.startsWith("Sin volumen") || m.startsWith("Fecha ilegible"));
    fila.estado = duro ? "error" : "ok";
    return fila;
  });

  return {
    filas,
    columnas: headers,
    ignoradas,
    listas: filas.filter((f) => f.estado === "ok").length,
    conError: filas.filter((f) => f.estado === "error").length,
  };
}
