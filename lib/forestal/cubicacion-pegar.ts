/**
 * cubicacion-pegar — la «tabla para pegar» del cubicador (Brandon 25-10:
 * «copiar una columna entera y pegarlo, o copiar varias columnas enteras y
 * pegarlos… una tabla con sus respectivas columnas»). PURO y client-safe:
 * texto del portapapeles → celdas → la tabla → piezas. La pantalla vive en
 * `components/admin/forestal/cubicador-pegar-tabla.tsx`.
 *
 * Reusa del importador de archivos los números (`aNumero`: coma decimal,
 * «2 1/2», «1.234,5»), la especie (`normalizarEspecie`) y los sinónimos de
 * cada título (`ALIAS`). Lo que NO reusa, a propósito, es el partidor de
 * líneas: `leerTextoAFilas` elige el separador entre tab, «;» y «,» y saltea
 * las líneas vacías — bien para un CSV, mal para el portapapeles de Excel, que
 * es SIEMPRE tab: una columna sola con «1,5» se partía en dos celdas, y una
 * celda vacía en medio de la columna corría todas las de abajo una fila.
 */

import { cubicarPieza, ESPECIES_MADERA, m3DesdePt, medidaSospechosa, type Unidad } from "./cubicacion";
import { aNumero, ALIAS, normalizarEspecie, sinAcentos, type PiezaImportada } from "./cubicacion-import";

/** Las columnas de la tabla, en el orden en que se ven (y en el que se pega sin títulos). */
export const COLUMNAS_PEGAR = ["cantidad", "espesor", "ancho", "largo", "especie", "dueno", "observacion"] as const;
export type ColumnaPegar = (typeof COLUMNAS_PEGAR)[number];
export type FilaPegar = Record<ColumnaPegar, string>;
/** Un rango de celdas, con las puntas incluidas (`c0..c1` son índices de `COLUMNAS_PEGAR`). */
export interface RangoPegar { f0: number; f1: number; c0: number; c1: number }

export interface UnidadesPegar { espesor: "pulg" | "cm"; ancho: "pulg" | "cm"; largo: "pies" | "m" }
/** La convención de la plaza: espesor y ancho en pulgadas, largo en pies. */
export const UNIDADES_DE_FABRICA: UnidadesPegar = { espesor: "pulg", ancho: "pulg", largo: "pies" };

/** Filas vacías listas al abrir; crecen solas al pegar. */
export const FILAS_DE_ARRANQUE = 20;
/** Filas vacías que siempre quedan debajo de la última con datos. */
const FILAS_DE_SOBRA = 5;

export const filaVacia = (): FilaPegar => ({ cantidad: "", espesor: "", ancho: "", largo: "", especie: "", dueno: "", observacion: "" });
export const esFilaVacia = (f: FilaPegar): boolean => COLUMNAS_PEGAR.every((c) => f[c].trim() === "");

/** Cómo se llama cada columna en la tabla: con su unidad, que es lo que cambia la cuenta. */
export function tituloDeColumna(c: ColumnaPegar, u: UnidadesPegar = UNIDADES_DE_FABRICA): string {
  switch (c) {
    case "cantidad": return "Cant.";
    case "espesor": return `Espesor ${u.espesor === "pulg" ? "″" : "cm"}`;
    case "ancho": return `Ancho ${u.ancho === "pulg" ? "″" : "cm"}`;
    case "largo": return `Largo ${u.largo}`;
    case "especie": return "Especie";
    case "dueno": return "Dueño";
    case "observacion": return "Observación";
  }
}

/** Siempre ≥ 20 filas y 5 vacías debajo de la última con datos. Nunca quita filas. */
export function conFilasDeSobra(filas: readonly FilaPegar[]): FilaPegar[] {
  let ultima = -1;
  filas.forEach((f, i) => { if (!esFilaVacia(f)) ultima = i; });
  const largo = Math.max(FILAS_DE_ARRANQUE, ultima + 1 + FILAS_DE_SOBRA, filas.length);
  const out = filas.slice();
  while (out.length < largo) out.push(filaVacia());
  return out;
}

// ── Portapapeles → celdas ────────────────────────────────────────────────────

/**
 * El texto del portapapeles → matriz de celdas. Tab separa columnas y el salto
 * de línea, filas (así lo deja Excel, LibreOffice y Google Sheets). Las líneas
 * vacías del medio se CONSERVAN (son celdas vacías de la columna); la última,
 * que Excel agrega siempre, no. Una celda entre comillas puede traer tabs o
 * saltos adentro (Excel la escribe así); si las comillas nunca cierran, eran
 * parte del dato («2"») y se lee sin ellas.
 */
export function partirPegado(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  let alInicio = true;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
      continue;
    }
    if (c === '"' && alInicio) { enComillas = true; alInicio = false; continue; }
    if (c === "\t") { fila.push(campo); campo = ""; alInicio = true; continue; }
    if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; alInicio = true; continue; }
    campo += c;
    alInicio = false;
  }
  if (enComillas) return sinFilasVaciasAlFinal(t.split("\n").map((l) => l.split("\t")));
  fila.push(campo);
  filas.push(fila);
  return sinFilasVaciasAlFinal(filas);
}

/** Recorta cada celda y quita las filas vacías del final (Excel siempre deja una). */
function sinFilasVaciasAlFinal(filas: string[][]): string[][] {
  const limpias = filas.map((f) => f.map((v) => v.trim()));
  let n = limpias.length;
  while (n > 0 && limpias[n - 1].every((v) => v === "")) n--;
  return limpias.slice(0, n);
}

/**
 * `aNumero` del importador, pero sólo si la celda trae algún dígito: él borra
 * «pulg», «pies», «"» antes de leer y una celda «pies» le daba 0.
 */
export const numeroDeCelda = (v: string): number | null => (/\d/.test(v) ? aNumero(v) : null);

// ── Títulos ──────────────────────────────────────────────────────────────────

/** Sinónimos que el importador de archivos no necesitaba y acá sí (la hoja del cubicador dice «Anc. "»). */
const ALIAS_EXTRA: Partial<Record<ColumnaPegar, string[]>> = {
  cantidad: ["pz", "pzs", "pza", "pzas", "piezas"],
  espesor: ["espe"],
  ancho: ["anc"],
  largo: ["larg"],
  dueno: ["dueno", "duenos", "propietario", "cliente"],
  observacion: ["observacion", "observaciones", "obs", "nota", "notas", "comentario", "comentarios"],
};

/** Títulos que se reconocen pero no se pegan: salen solos de la medida (o no son de la pieza). */
const CALCULADAS = new Set(["pt", "p t", "pie tablar", "pies tablares", "tablar", "volumen", "vol", "valor", "valor s/", "precio", "importe", "n°", "nº", "item", "fecha", "fecha hora", "hora", "apartado"]);

const clave = (s: string) => sinAcentos(s).replace(/[.:()[\]]/g, " ").replace(/\s+/g, " ").trim();

const SINONIMOS: [ColumnaPegar, Set<string>][] = COLUMNAS_PEGAR.map((c) => {
  const base = c in ALIAS ? ALIAS[c as keyof typeof ALIAS] : [];
  return [c, new Set([...base, ...(ALIAS_EXTRA[c] ?? [])].map(clave))];
});

type LecturaTitulo =
  | { tipo: "columna"; columna: ColumnaPegar; unidad: Unidad | null; exacto: boolean }
  | { tipo: "calculada" | "unidad" | "desconocida" | "vacio" };

/** «Largo (m)», «Esp. "», «Espesor cm», «Largo pies» → la columna y, si la dice, su unidad. */
export function leerTitulo(titulo: string): LecturaTitulo {
  const crudo = sinAcentos(titulo).trim();
  if (!crudo) return { tipo: "vacio" };
  if (/m3|m³|tablar/.test(crudo) || CALCULADAS.has(clave(crudo))) return { tipo: "calculada" };
  if (/^u[.\s]|unidad/.test(crudo)) return { tipo: "unidad" };
  let unidad: Unidad | null = null;
  if (/["″]|\bpulg/.test(crudo)) unidad = "pulg";
  else if (/\bcm\b|centim/.test(crudo)) unidad = "cm";
  else if (/['′]|\bpies?\b|\bft\b/.test(crudo)) unidad = "pies";
  else if (/\bmts?\b|\bmetros?\b|\(m\)|\sm$/.test(crudo)) unidad = "m";
  const sinUnidad = clave(
    crudo
      .replace(/\((pulg\w*|cm|pies?|ft|m|mts?|metros?)\)/g, " ")
      .replace(/["″'′]/g, " ")
      .replace(/\b(pulg\w*|cm|centim\w*|pies?|ft|mts?|metros?|en|de|del)\b/g, " ")
      .replace(/\sm$/, " "),
  );
  for (const [columna, set] of SINONIMOS) {
    if (set.has(sinUnidad)) return { tipo: "columna", columna, unidad, exacto: sinUnidad === columna };
  }
  return { tipo: "desconocida" };
}

const MOTIVO_SIN_USAR = {
  calculada: "sale solo de la medida",
  unidad: "la unidad se elige arriba de cada columna",
  desconocida: "no es una columna de la tabla",
} as const;

export interface Encabezado {
  /** A qué columna de la tabla va cada columna pegada (`null` = no se pega). */
  destinos: (ColumnaPegar | null)[];
  unidades: Partial<UnidadesPegar>;
  /** «Puse 'Largo' en Largo pies»: título pegado → columna, en el orden pegado. */
  puestas: { titulo: string; columna: ColumnaPegar }[];
  /** Columnas que traían título pero no se pegaron, con el porqué. */
  sinUsar: { titulo: string; motivo: string }[];
}

/**
 * ¿La primera fila pegada son títulos? Sí cuando no trae ningún número, nombra
 * al menos una columna de la tabla y la mitad de sus celdas con texto son
 * títulos conocidos (así «Tornillo · Juan» no se toma por encabezado).
 */
export function leerEncabezado(fila: readonly string[]): Encabezado | null {
  const llenas = fila.filter((v) => v.trim() !== "");
  if (llenas.length === 0 || llenas.some((v) => numeroDeCelda(v) !== null)) return null;
  const lecturas = fila.map(leerTitulo);
  const conocidas = lecturas.filter((l) => l.tipo === "columna" || l.tipo === "calculada" || l.tipo === "unidad").length;
  if (!lecturas.some((l) => l.tipo === "columna") || conocidas * 2 < llenas.length) return null;

  const destinos: (ColumnaPegar | null)[] = fila.map(() => null);
  const unidades: Partial<UnidadesPegar> = {};
  const sinUsar: Encabezado["sinUsar"] = [];
  // Si dos títulos caen en la misma columna («Tipo» y «Especie»), gana el que la nombra tal cual.
  const ganador = new Map<ColumnaPegar, number>();
  lecturas.forEach((l, i) => {
    if (l.tipo !== "columna") return;
    const previo = ganador.get(l.columna);
    const lp = previo === undefined ? null : lecturas[previo];
    if (previo === undefined || (l.exacto && lp?.tipo === "columna" && !lp.exacto)) ganador.set(l.columna, i);
  });
  lecturas.forEach((l, i) => {
    const titulo = fila[i].trim();
    if (l.tipo !== "columna") {
      if (l.tipo !== "vacio") sinUsar.push({ titulo, motivo: MOTIVO_SIN_USAR[l.tipo] });
      return;
    }
    if (ganador.get(l.columna) !== i) { sinUsar.push({ titulo, motivo: `ya había otra columna de ${tituloDeColumna(l.columna)}` }); return; }
    const { columna, unidad } = l;
    destinos[i] = columna;
    if ((columna === "espesor" || columna === "ancho") && (unidad === "pulg" || unidad === "cm")) unidades[columna] = unidad;
    if (columna === "largo" && (unidad === "pies" || unidad === "m")) unidades.largo = unidad;
  });
  const puestas = destinos.flatMap((d, i) => (d ? [{ titulo: fila[i].trim(), columna: d }] : []));
  return { destinos, unidades, puestas, sinUsar };
}

/** ¿Todas las celdas con algo de esta columna son números? (`null` = la columna está vacía) */
function columnaNumerica(cuerpo: readonly string[][], i: number): boolean | null {
  const llenas = cuerpo.map((f) => f[i] ?? "").filter((v) => v.trim() !== "");
  if (llenas.length === 0) return null;
  return llenas.every((v) => numeroDeCelda(v) !== null);
}

/**
 * Sin títulos y sin una celda elegida (el Ctrl+V de la vista Cargar): se
 * adivina por la forma. 3 columnas de números = espesor · ancho · largo; 4 o
 * más = cantidad · espesor · ancho · largo (salvo que la 4.ª sea el PT de las
 * tres primeras: entonces es espesor · ancho · largo · PT). Las de texto van a
 * especie, dueño y observación, en ese orden. Con 1 o 2 de números no hay
 * forma de saber: van desde Cant. y el aviso lo dice.
 */
export function destinosSinTitulos(cuerpo: readonly string[][]): (ColumnaPegar | null)[] {
  const ancho = Math.max(0, ...cuerpo.map((f) => f.length));
  const tipos = Array.from({ length: ancho }, (_, i) => columnaNumerica(cuerpo, i));
  const nums = tipos.flatMap((t, i) => (t === true ? [i] : []));
  const destinos: (ColumnaPegar | null)[] = tipos.map(() => null);
  const textos: ColumnaPegar[] = ["especie", "dueno", "observacion"];
  const aTexto = () => tipos.forEach((t, i) => { if (t === false) destinos[i] = textos.shift() ?? null; });
  if (nums.length < 3) {
    const medidas: ColumnaPegar[] = ["cantidad", "espesor", "ancho", "largo"];
    nums.forEach((i) => { destinos[i] = medidas.shift() ?? null; });
    aTexto();
    return destinos;
  }
  const cuartaEsPt = nums.length >= 4 && cuerpo.every((f) => {
    const [e, a, l, pt] = nums.slice(0, 4).map((i) => numeroDeCelda(f[i] ?? ""));
    if (e === null || a === null || l === null || pt === null) return true;
    return Math.abs((e * a * l) / 12 - pt) <= Math.max(0.5, pt * 0.02);
  });
  const orden: ColumnaPegar[] = nums.length >= 4 && !cuartaEsPt ? ["cantidad", "espesor", "ancho", "largo"] : ["espesor", "ancho", "largo"];
  orden.forEach((c, k) => { destinos[nums[k]] = c; });
  aTexto();
  return destinos;
}

// ── Pegar sobre la tabla ─────────────────────────────────────────────────────

export interface ResultadoPegar {
  filas: FilaPegar[];
  unidades: UnidadesPegar;
  /** Lo que se le cuenta a la persona: dónde quedó cada cosa y qué no entró. */
  aviso: string;
  /** Lo que quedó pegado, para dejarlo marcado. `null` = no se pegó nada. */
  rango: RangoPegar | null;
}

const nombreDe = (c: ColumnaPegar, u: UnidadesPegar) => tituloDeColumna(c, u);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Pega `texto` en la tabla, como Excel:
 * - con títulos, cada columna va a la suya por el nombre (en cualquier orden),
 *   desde la fila de la celda elegida;
 * - sin títulos y con una celda elegida, desde esa celda hacia la derecha y
 *   hacia abajo (lo que sobra a la derecha de la última columna, no entra);
 * - sin títulos ni celda, se adivina por la forma (`destinosSinTitulos`);
 * - un valor solo sobre un rango marcado llena el rango entero.
 * Las filas crecen solas; nunca se borra una fila.
 */
export function aplicarPegado(
  estado: { filas: readonly FilaPegar[]; unidades: UnidadesPegar },
  texto: string,
  en: { fila: number; col: number } | null,
  seleccion?: RangoPegar | null,
): ResultadoPegar {
  const matriz = partirPegado(texto);
  const unidades = { ...estado.unidades };
  const filas = estado.filas.map((f) => ({ ...f }));
  if (matriz.length === 0) return { filas: conFilasDeSobra(filas), unidades, aviso: "No había nada para pegar.", rango: null };

  if (matriz.length === 1 && matriz[0].length === 1 && seleccion && (seleccion.f1 > seleccion.f0 || seleccion.c1 > seleccion.c0)) {
    for (let f = seleccion.f0; f <= seleccion.f1; f++) {
      for (let c = seleccion.c0; c <= seleccion.c1; c++) filas[f] = { ...(filas[f] ?? filaVacia()), [COLUMNAS_PEGAR[c]]: matriz[0][0] };
    }
    const n = (seleccion.f1 - seleccion.f0 + 1) * (seleccion.c1 - seleccion.c0 + 1);
    return { filas: conFilasDeSobra(filas), unidades, aviso: `Puse «${matriz[0][0]}» en las ${n} celdas marcadas.`, rango: seleccion };
  }

  const encabezado = leerEncabezado(matriz[0]);
  const cuerpo = encabezado ? matriz.slice(1) : matriz;
  const ancho = Math.max(0, ...matriz.map((f) => f.length));
  let destinos: (ColumnaPegar | null)[];
  const partes: string[] = [];
  if (encabezado) {
    destinos = encabezado.destinos;
    Object.assign(unidades, encabezado.unidades);
    partes.push(`Leí los títulos: ${encabezado.puestas.map((p) => `puse «${p.titulo}» en ${nombreDe(p.columna, unidades)}`).join(" · ")}.`);
    if (encabezado.sinUsar.length > 0) partes.push(`No usé ${encabezado.sinUsar.map((s) => `«${s.titulo}» (${s.motivo})`).join(", ")}.`);
  } else if (en) {
    destinos = Array.from({ length: ancho }, (_, k) => COLUMNAS_PEGAR[en.col + k] ?? null);
    const sobran = destinos.filter((d) => d === null).length;
    if (sobran > 0) partes.push(`${plural(sobran, "columna sobró", "columnas sobraron")} a la derecha de Observación y no ${sobran === 1 ? "entró" : "entraron"}.`);
  } else {
    destinos = destinosSinTitulos(cuerpo);
    const usadas = destinos.filter((d): d is ColumnaPegar => d !== null);
    partes.push(`Sin títulos: leí las columnas como ${usadas.map((d) => nombreDe(d, unidades)).join(" · ")}. Si no es así: Ctrl+Z, clic en la celda donde va y pega otra vez.`);
    const sobran = destinos.length - usadas.length;
    if (sobran > 0) partes.push(`No usé ${plural(sobran, "columna", "columnas")} (¿PT o m³? salen solos).`);
  }

  if (cuerpo.length === 0) {
    return { filas: conFilasDeSobra(filas), unidades, aviso: [...partes, "Sólo venían los títulos: copia también las filas de abajo."].join(" "), rango: null };
  }
  const desde = en?.fila ?? 0;
  cuerpo.forEach((celdas, r) => {
    const i = desde + r;
    while (filas.length <= i) filas.push(filaVacia());
    destinos.forEach((d, k) => { if (d) filas[i] = { ...filas[i], [d]: celdas[k] ?? "" }; });
  });
  const cols = destinos.flatMap((d) => (d ? [COLUMNAS_PEGAR.indexOf(d)] : []));
  const rango = cols.length ? { f0: desde, f1: desde + cuerpo.length - 1, c0: Math.min(...cols), c1: Math.max(...cols) } : null;
  const donde = encabezado || !en ? "" : ` desde ${nombreDe(COLUMNAS_PEGAR[en.col], unidades)} (fila ${desde + 1})`;
  partes.unshift(`Pegué ${plural(cuerpo.length, "fila", "filas")}${donde}.`);
  return { filas: conFilasDeSobra(filas), unidades, aviso: partes.join(" "), rango };
}

/** Las celdas de un rango, como TSV (Ctrl+C desde la tabla). */
export function rangoATexto(filas: readonly FilaPegar[], r: RangoPegar): string {
  const out: string[] = [];
  for (let f = r.f0; f <= r.f1; f++) {
    const fila = filas[f] ?? filaVacia();
    out.push(COLUMNAS_PEGAR.slice(r.c0, r.c1 + 1).map((c) => fila[c]).join("\t"));
  }
  return out.join("\n");
}

// ── Tabla → piezas ───────────────────────────────────────────────────────────

/** La especie escrita → la de la lista del negocio si se parece; si no, entra igual y se avisa. */
export function especieDeLaLista(texto: string, lista: readonly string[]): { nombre?: string; fueraDeLista: boolean } {
  const s = texto.trim();
  if (!s) return { fueraDeLista: false };
  const conocidas = lista.length > 0 ? lista : ESPECIES_MADERA;
  const k = sinAcentos(s);
  const exacta = conocidas.find((e) => sinAcentos(e) === k);
  if (exacta) return { nombre: exacta, fueraDeLista: false };
  const porComienzo = k.length >= 3 ? conocidas.find((e) => sinAcentos(e).startsWith(k)) : undefined;
  if (porComienzo) return { nombre: porComienzo, fueraDeLista: false };
  const nombre = normalizarEspecie(s) ?? s;
  return { nombre, fueraDeLista: !conocidas.some((e) => sinAcentos(e) === sinAcentos(nombre)) };
}

export interface FilaLeida {
  vacia: boolean;
  /** Motivo por celda: la celda sale en rojo y la fila no entra al lote. */
  errores: Partial<Record<ColumnaPegar, string>>;
  /** Entra igual, pero se avisa (especie que no está en la lista). */
  avisos: Partial<Record<ColumnaPegar, string>>;
  pieza: PiezaImportada | null;
}

function medida(v: string): { valor: number | null; error?: string } {
  if (v.trim() === "") return { valor: null, error: "Falta la medida" };
  const n = numeroDeCelda(v);
  if (n === null) return { valor: null, error: `«${v}» no es una medida` };
  if (!(n > 0)) return { valor: null, error: "Tiene que ser mayor que cero" };
  return { valor: n };
}

/** Una fila de la tabla → su pieza cubicada (PT con la fórmula del cubicador; el m³ sale del PT). */
export function leerFila(f: FilaPegar, i: number, u: UnidadesPegar, especies: readonly string[] = []): FilaLeida {
  if (esFilaVacia(f)) return { vacia: true, errores: {}, avisos: {}, pieza: null };
  const errores: FilaLeida["errores"] = {};
  const avisos: FilaLeida["avisos"] = {};
  let cantidad = 1;
  if (f.cantidad.trim() !== "") {
    const n = numeroDeCelda(f.cantidad);
    if (n === null) errores.cantidad = `«${f.cantidad}» no es un número`;
    else if (!(n >= 1)) errores.cantidad = "Tiene que ser 1 o más";
    else if (!Number.isInteger(n)) errores.cantidad = "Las piezas van sin decimales";
    else cantidad = n;
  }
  const esp = medida(f.espesor);
  const anc = medida(f.ancho);
  const lar = medida(f.largo);
  if (esp.error) errores.espesor = esp.error;
  if (anc.error) errores.ancho = anc.error;
  if (lar.error) errores.largo = lar.error;
  const especie = especieDeLaLista(f.especie, especies);
  if (especie.fueraDeLista) avisos.especie = `«${especie.nombre}» no está en tu lista de especies: entra igual`;
  if (Object.keys(errores).length > 0 || esp.valor === null || anc.valor === null || lar.valor === null) {
    return { vacia: false, errores, avisos, pieza: null };
  }
  const base = { cantidad, espesor: esp.valor, ancho: anc.valor, largo: lar.valor, uEspesor: u.espesor, uAncho: u.ancho, uLargo: u.largo };
  const { pieTablar, m3 } = cubicarPieza(base);
  const comercial = u.espesor === "pulg" && u.ancho === "pulg" && u.largo === "pies";
  return {
    vacia: false,
    errores,
    avisos,
    pieza: {
      id: `peg-${i}`,
      ...base,
      especie: especie.nombre,
      dueno: f.dueno.trim() || undefined,
      observacion: f.observacion.trim() || undefined,
      pieTablar,
      m3,
      filaOrigen: i + 1,
      sospechosa: comercial ? medidaSospechosa(esp.valor, anc.valor, lar.valor) : false,
    },
  };
}

export interface ResumenPegado {
  /** Las que entran al lote (las filas en rojo no). */
  piezas: PiezaImportada[];
  filasConError: number;
  totalPiezas: number;
  pt: number;
  /** Del PT total ÷ 424, nunca la suma de los m³ por fila. */
  m3: number;
}

export function resumirPegado(leidas: readonly FilaLeida[]): ResumenPegado {
  const piezas = leidas.flatMap((l) => (l.pieza ? [l.pieza] : []));
  const pt = Math.round(piezas.reduce((a, p) => a + p.pieTablar, 0) * 100) / 100;
  return {
    piezas,
    filasConError: leidas.filter((l) => !l.vacia && !l.pieza).length,
    totalPiezas: piezas.reduce((a, p) => a + p.cantidad, 0),
    pt,
    m3: m3DesdePt(pt),
  };
}

/** ¿Lo pegado parece una tabla (para abrir la tabla al pegar con el foco fuera de un campo)? */
export function pareceTabla(texto: string): boolean {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  return texto.includes("\t") || lineas.length >= 2;
}
