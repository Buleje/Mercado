/**
 * lib/forestal/loth-resolucion-lectura.ts — «Llenar desde la resolución»: lo
 * que se lee de la resolución (o del certificado de registro de una
 * plantación) que YA está en la carpeta del plan, y la propuesta contra lo
 * que el plan guarda hoy.
 *
 * Dos lectores, el mismo resultado:
 *   · `leerResolucionDeTexto` — sin IA. Lee el texto que el Archivo ya sacó
 *     del PDF (o del escaneo, con el OCR del servidor) al subirlo. Busca sólo
 *     lo que el papel ROTULA («Registro N°», «Titular … Razón Social:»,
 *     «vigencia … desde … hasta …», «N árboles … con producción de X m3»);
 *     lo que no está rotulado queda `null`, nunca adivinado.
 *   · la visión (si hay clave de IA): plantación → `PROMPT_CONSTANCIA` de
 *     `loth-constancia-ocr` (el lector del alta, ronda 3 de ADR-459); bosque
 *     → `PROMPT_RESOLUCION` de acá. Lo que la IA no leyó lo completa el texto
 *     (`juntarLecturas`).
 *
 * Nada de esto guarda: la persona marca qué pasa al plan y confirma.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */
import { z } from "zod";
import { FORESTRY_SPECIES } from "@/data/forestry-species";
import { mismaEspecie } from "@/lib/forestal/loth-constants";
import { aNumero, fechaIso, type LecturaConstancia } from "@/lib/forestal/loth-constancia-ocr";

export interface EspecieDeResolucion {
  /** Nombre común como lo guarda el plan (o el del catálogo de SERFOR). */
  especie: string;
  cientifico: string | null;
  volumenM3: number | null;
  arboles: number | null;
}

export interface LecturaResolucion {
  /** N° de la resolución o de la constancia, tal como está. */
  numero: string | null;
  /** Código del registro de la plantación («19-SEC/REG-PLT-2025-096»), si es uno. */
  codigoRegistro: string | null;
  /** AAAA-MM-DD de emisión. */
  fecha: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  titular: string | null;
  autoridad: string | null;
  especies: EspecieDeResolucion[];
  /** Lo dudoso, en palabras. */
  avisos: string[];
}

/** Una especie que ya conocemos (las del plan): su nombre manda sobre el del catálogo. */
export interface EspecieConocida {
  comun: string;
  cientifico?: string | null;
}

// ── Texto con posiciones ────────────────────────────────────────────────────

/** Minúsculas y sin tildes, UN carácter por carácter: las posiciones siguen valiendo en el original. */
function plano(t: string): string {
  let s = "";
  for (const ch of t) {
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    s += (base[0] ?? " ").toLowerCase();
    if (ch.length === 2) s += " "; // un carácter de 2 unidades (emoji) ocupa 2 posiciones
  }
  return s;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const F_LARGA = `\\d{1,2}\\s*[°º]?\\s*(?:de\\s+)?(?:${Object.keys(MESES).join("|")})\\s*(?:de|del)?\\s*\\d{4}`;
const F_CORTA = `\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}|\\d{4}-\\d{2}-\\d{2}`;
/** Una fecha escrita, sin grupos (para armar patrones). */
const FECHA = `(?:${F_LARGA}|${F_CORTA})`;

/** «03 de Septiembre de 2025», «03.09.2025», «2025-09-03» → «2025-09-03», o null. */
export function fechaDeTexto(s: string): string | null {
  const t = plano(s).trim();
  const m = new RegExp(`^(\\d{1,2})\\s*[°º]?\\s*(?:de\\s+)?(${Object.keys(MESES).join("|")})\\s*(?:de|del)?\\s*(\\d{4})$`).exec(t);
  if (m) return fechaIso(`${m[1]}/${MESES[m[2]]}/${m[3]}`);
  return fechaIso(t);
}

const limpiar = (s: string | null | undefined, max = 160): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").replace(/^[\s,;:.\-–(]+|[\s,;:\-–(]+$/g, "").trim();
  return t.length >= 3 && /[a-záéíóúñ]{2}/i.test(t) ? t.slice(0, max) : null;
};

// ── Cada dato ───────────────────────────────────────────────────────────────

const ROTULO_NUMERO =
  "(?:\\bRegistro|\\bResoluci[oó]n(?:\\s+(?:Directoral|Administrativa|Jefatural|Gerencial|Ejecutiva|Regional|General|de\\s+Gerencia|Sub\\s?Gerencial|Sub\\s?Directoral)){0,3}|\\bR\\.\\s?[DAJ]\\.?|\\bR\\.\\s?G\\.\\s?R\\.?|\\bRDR|\\bRGR|\\bRJ)" +
  "\\s*(?:N[°º\"'*.:]?|Nro\\.?|N[uú]mero)\\s*[°º\"'*.:]*\\s*";
/* El código: cifras, letras, guiones y barras; un espacio sólo si lo que sigue
   también es código (el OCR parte «19-SEC» en «1 9-SEC»). */
const CODIGO = "([0-9][0-9A-ZÑ./-]*(?:\\s(?=[0-9A-ZÑ]*[-/])[0-9A-ZÑ./-]+)*)";

function codigoLimpio(c: string): string | null {
  const t = c.replace(/\s+/g, "").replace(/[./-]+$/, "").toUpperCase();
  return /\d/.test(t) && /[-/]/.test(t) && t.length >= 5 && t.length <= 80 ? t : null;
}

function leerNumero(texto: string, avisos: string[]): string | null {
  const hallados: string[] = [];
  for (const m of texto.matchAll(new RegExp(ROTULO_NUMERO + CODIGO, "gi"))) {
    const c = codigoLimpio(m[1]);
    if (c) hallados.push(c);
  }
  for (const m of texto.matchAll(/N[uú]mero de (?:la\s+)?(?:registro|resoluci[oó]n|constancia)\s*:\s*([^;\n]+)/gi)) {
    const c = codigoLimpio(m[1].split(/\s(?![0-9A-ZÑ]*[-/])/)[0] ?? "");
    if (c) hallados.push(c);
  }
  const distintos = [...new Set(hallados)];
  if (distintos.length > 1) avisos.push(`El papel trae más de un número (${distintos.slice(0, 3).join(", ")}): se tomó el primero.`);
  return distintos[0] ?? null;
}

function leerFecha(texto: string): string | null {
  const patrones = [
    new RegExp(`Fecha de (?:emisi[oó]n|expedici[oó]n|la resoluci[oó]n|inscripci[oó]n|aprobaci[oó]n)\\s*:?\\s*(${FECHA})`, "i"),
    new RegExp(`Lugar y fecha\\s*:?[^\\d]{0,60}?(${FECHA})`, "i"),
    /* «Pucallpa, 15 de marzo de 2024»: la ciudad y la coma, como encabeza una resolución. */
    new RegExp(`\\b[A-ZÁÉÍÓÚ][a-záéíóúñ]{3,20},\\s*(${F_LARGA})`),
    new RegExp(`\\bFecha\\s*:\\s*(${FECHA})`, "i"),
  ];
  for (const re of patrones) {
    const m = re.exec(texto);
    const f = m ? fechaDeTexto(m[1]) : null;
    if (f) return f;
  }
  return null;
}

function leerVigencia(texto: string, avisos: string[]): { desde: string | null; hasta: string | null } {
  const rango = new RegExp(
    `(?:desde|del|a partir del?)\\s+(?:el\\s+|d[ií]a\\s+)?(${FECHA})\\s*,?\\s*(?:hasta|al)\\s+(?:el\\s+|d[ií]a\\s+)?(${FECHA})`,
    "gi",
  );
  const rotulado = new RegExp(`vigencia\\s*:?\\s*(${FECHA})\\s*(?:-|–|al|hasta)\\s*(${FECHA})`, "gi");
  const clave = /vigen|per[ií]odo|plazo|a[ñn]o operativo|v[aá]lid/i;
  for (const re of [rotulado, rango]) {
    for (const m of texto.matchAll(re)) {
      const antes = texto.slice(Math.max(0, (m.index ?? 0) - 300), (m.index ?? 0) + 12);
      if (re === rango && !clave.test(antes)) continue;
      const desde = fechaDeTexto(m[1]);
      const hasta = fechaDeTexto(m[2]);
      if (desde && hasta && desde < hasta) return { desde, hasta };
    }
  }
  if (/vigencia\s+de\s+\d+\s+a[ñn]os|por\s+(?:un\s+(?:per[ií]odo|plazo)\s+de\s+)?\d+\s+a[ñn]os/i.test(texto)) {
    avisos.push("La vigencia está en años y no en fechas: anótala a mano desde la fecha de la resolución.");
  }
  return { desde: null, hasta: null };
}

function leerTitular(texto: string): string | null {
  const patrones = [
    /\bTitular\b[^:\n]{0,40}:\s*[,;\s]*(.{3,160}?)\s*(?:\(|\bRUC\b|\bDNI\b|\bDirecci[oó]n\b|\bDomicilio\b|;|\n|$)/i,
    /\ba favor de(?:l|\s+la|\s+los)?\s+(.{3,120}?)\s*(?:,|;|\.\s|\bcon\b|\bidentificad|\bRUC\b|\bDNI\b|$)/i,
  ];
  for (const re of patrones) {
    const t = limpiar(re.exec(texto)?.[1]);
    if (t) return t;
  }
  return null;
}

const NO_ES_LUGAR = new Set(["VISTO", "VISTOS", "RUC", "DNI", "CONSIDERANDO", "SE", "RESUELVE", "DE", "EL", "LA"]);

function leerAutoridad(texto: string): string | null {
  const sigla = /\b(ATFFS|ARFFS|GERFFS|GRFFS|GERFOR|DRFFS)\b[\s\-–]+((?:[A-ZÁÉÍÓÚÑ]{3,}\s?){1,3})/.exec(texto);
  if (sigla) {
    const lugar = sigla[2].trim().split(/\s+/).filter((w) => !NO_ES_LUGAR.has(w));
    return lugar.length ? `${sigla[1]} ${lugar.join(" ")}` : sigla[1];
  }
  const larga = /Administraci[oó]n T[eé]cnica Forestal y de Fauna Silvestre\s*[-–]?\s*((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s?){1,3})/.exec(texto);
  if (larga) return `ATFFS ${larga[1].trim()}`;
  return limpiar(/\bGerencia Regional (?:Forestal|de Desarrollo Forestal)[^,.;\n]{0,60}/.exec(texto)?.[0], 120);
}

// ── Especies y volúmenes ────────────────────────────────────────────────────

interface Mencion {
  inicio: number;
  fin: number;
  especie: string;
  cientifico: string | null;
}

/** «Otra especie (especificar)» del catálogo: ningún papel la nombra, y «otra especie» sí aparece en el texto. */
const COMODINES_DEL_CATALOGO: ReadonlySet<string> = new Set(["otro"]);

function menciones(p: string, conocidas: readonly EspecieConocida[]): Mencion[] {
  const nombres: { n: string; especie: string; cientifico: string | null }[] = [];
  const delPlan = (comun: string, cientifico: string | null) =>
    conocidas.find((c) => mismaEspecie(c.comun, comun) || (cientifico && c.cientifico && mismaEspecie(c.cientifico, cientifico)));
  for (const c of conocidas) {
    nombres.push({ n: c.comun, especie: c.comun, cientifico: c.cientifico ?? null });
    if (c.cientifico) nombres.push({ n: c.cientifico, especie: c.comun, cientifico: c.cientifico });
  }
  for (const s of FORESTRY_SPECIES) {
    if (COMODINES_DEL_CATALOGO.has(s.slug)) continue;
    const suya = delPlan(s.commonName, s.scientificName);
    const especie = suya?.comun ?? s.commonName;
    for (const n of [s.commonName, s.scientificName, ...(s.altNames ?? [])]) nombres.push({ n, especie, cientifico: s.scientificName });
  }
  const fuera: Mencion[] = [];
  for (const { n, especie, cientifico } of nombres) {
    const k = plano(n).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (k.length < 4) continue;
    const re = new RegExp(`(?<![a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "g");
    for (const m of p.matchAll(re)) fuera.push({ inicio: m.index ?? 0, fin: (m.index ?? 0) + k.length, especie, cientifico });
  }
  return fuera.sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
}

/** La mención más cercana antes de `pos` (hasta `antes` letras) o, si no hay, después (hasta `despues`). */
function duenaDe(ms: readonly Mencion[], pos: number, antes: number, despues: number): Mencion | null {
  let previa: Mencion | null = null;
  for (const m of ms) if (m.fin <= pos && pos - m.fin <= antes && (!previa || m.fin > previa.fin)) previa = m;
  if (previa) return previa;
  return ms.find((m) => m.inicio >= pos && m.inicio - pos <= despues) ?? null;
}

const entero = (s: string): number | null => {
  const d = s.replace(/[.,\s]/g, "");
  const n = Number(d);
  return d && Number.isInteger(n) && n > 0 && n < 10_000_000 ? n : null;
};

function leerEspecies(texto: string, conocidas: readonly EspecieConocida[], avisos: string[]): EspecieDeResolucion[] {
  const p = plano(texto);
  const ms = menciones(p, conocidas);
  const porEspecie = new Map<string, EspecieDeResolucion>();
  const fila = (m: Mencion) => {
    const k = m.especie.toLowerCase();
    let f = porEspecie.get(k);
    if (!f) {
      f = { especie: m.especie, cientifico: m.cientifico, volumenM3: null, arboles: null };
      porEspecie.set(k, f);
    }
    return f;
  };
  /* Números ACOTADOS (16 caracteres) y que empiezan donde empieza el número:
     con `\d[\d.,]*` libre, 60.000 dígitos seguidos tardaban 7 s (cada
     posición volvía a recorrer el resto). Un volumen real no pasa de 10 cifras. */
  for (const v of p.matchAll(/(?<![\d.,])(\d[\d.,]{0,15})\s{0,5}m\s?[3³](?![\w²])/g)) {
    const pos = v.index ?? 0;
    const n = aNumero(v[1]);
    const m = duenaDe(ms, pos, 200, 40);
    if (!m || n == null || n <= 0 || n > 10_000_000) continue;
    const f = fila(m);
    if (f.volumenM3 == null) f.volumenM3 = n;
    else if (Math.abs(f.volumenM3 - n) >= 0.001) {
      avisos.push(`Para ${f.especie} el papel dice ${f.volumenM3} y también ${n} m³: se tomó el primero, revisa cuál es el autorizado.`);
    }
  }
  /* «32 árboles de la especie … Tornillo»: el número va antes de la especie. */
  for (const a of p.matchAll(/(?<![\d.,])(\d[\d.,]{0,15})\s{1,5}(?:arboles|individuos|plantas)\b/g)) {
    const pos = (a.index ?? 0) + a[0].length;
    const n = entero(a[1]);
    const despues = ms.find((m) => m.inicio >= pos && m.inicio - pos <= 80);
    const m = despues ?? duenaDe(ms, a.index ?? 0, 120, 0);
    if (!m || n == null) continue;
    const f = fila(m);
    if (f.arboles == null) f.arboles = n;
  }
  return [...porEspecie.values()].filter((e) => e.volumenM3 != null || e.arboles != null);
}

/**
 * Lo que el texto de la resolución DICE, rotulado. `conocidas` = las especies
 * del plan: si el papel las nombra, vuelven con el nombre del plan.
 */
export function leerResolucionDeTexto(texto: string, conocidas: readonly EspecieConocida[] = []): LecturaResolucion {
  const avisos: string[] = [];
  const t = (texto ?? "").slice(0, 60_000);
  const numero = leerNumero(t, avisos);
  const vig = leerVigencia(t, avisos);
  return {
    numero,
    codigoRegistro: numero && /\bPLT\b|REG-PLT/i.test(numero) ? numero : null,
    fecha: leerFecha(t),
    vigenciaDesde: vig.desde,
    vigenciaHasta: vig.hasta,
    titular: leerTitular(t),
    autoridad: leerAutoridad(t),
    especies: leerEspecies(t, conocidas, avisos),
    avisos,
  };
}

/** ¿Se leyó algo que sirva? */
export function resolucionVacia(l: LecturaResolucion): boolean {
  return l.especies.length === 0 && [l.numero, l.fecha, l.vigenciaDesde, l.vigenciaHasta, l.titular, l.autoridad].every((v) => v == null);
}

/** La lectura del certificado de plantación (lector del alta) en la forma de acá. */
export function lecturaDesdeConstancia(l: LecturaConstancia): LecturaResolucion {
  return {
    numero: l.numeroConstancia ?? l.codigoRegistro,
    codigoRegistro: l.codigoRegistro,
    fecha: l.fechaInscripcion,
    vigenciaDesde: null,
    vigenciaHasta: null,
    titular: l.titular,
    autoridad: l.autoridad,
    especies: l.especies
      .filter((e) => e.nombreComun || e.nombreCientifico)
      .map((e) => ({ especie: (e.nombreComun ?? e.nombreCientifico) as string, cientifico: e.nombreCientifico, volumenM3: e.volumenM3, arboles: e.arboles })),
    avisos: l.nota ? [l.nota] : [],
  };
}

/** Lo de la IA manda; lo que no leyó lo completa el texto. Si dicen distinto, se avisa. */
export function juntarLecturas(ia: LecturaResolucion | null, texto: LecturaResolucion): LecturaResolucion {
  if (!ia) return texto;
  const avisos = [...ia.avisos];
  const campo = <K extends "numero" | "codigoRegistro" | "fecha" | "vigenciaDesde" | "vigenciaHasta" | "titular" | "autoridad">(k: K, rotulo: string) => {
    const a = ia[k];
    const b = texto[k];
    if (a && b && a.replace(/\W/g, "").toLowerCase() !== b.replace(/\W/g, "").toLowerCase()) {
      avisos.push(`${rotulo}: la IA leyó «${a}» y el texto dice «${b}». Revisa en el papel.`);
    }
    return a ?? b;
  };
  return {
    numero: campo("numero", "N°"),
    codigoRegistro: campo("codigoRegistro", "Código del registro"),
    fecha: campo("fecha", "Fecha"),
    vigenciaDesde: campo("vigenciaDesde", "Vigencia desde"),
    vigenciaHasta: campo("vigenciaHasta", "Vigencia hasta"),
    titular: campo("titular", "Titular"),
    autoridad: campo("autoridad", "Autoridad"),
    especies: ia.especies.length ? ia.especies : texto.especies,
    avisos: [...avisos, ...texto.avisos],
  };
}

// ── La IA para la resolución de un plan de bosque ───────────────────────────

export const PROMPT_RESOLUCION =
  "Este archivo es una RESOLUCIÓN de la autoridad forestal del Perú (ARFFS, ATFFS, Gerencia Regional Forestal o SERFOR) " +
  "que aprueba un plan de manejo forestal (PGMF, PO, PMFI o DEMA). Extrae SOLO lo que está escrito. Si un dato no aparece " +
  "o no se lee con seguridad, devuelve null: no lo completes, no lo calcules ni lo adivines.\n" +
  "- numero: el número de la resolución sin el tipo, como figura (ej. «123-2024-GOREU-GGR-GRFFS»).\n" +
  "- fecha: la fecha de la resolución, AAAA-MM-DD.\n" +
  "- vigenciaDesde, vigenciaHasta: el período de vigencia del plan o del año operativo aprobado, AAAA-MM-DD. Si sólo " +
  "dice «por N años», null.\n" +
  "- titular: nombre o razón social del titular del permiso, la concesión o la comunidad.\n" +
  "- autoridad: quién emite (ej. «ATFFS Selva Central», «GERFOR Ucayali»).\n" +
  "- especies: una fila por especie del cuadro de lo AUTORIZADO: nombreComun, nombreCientifico, volumenM3 (el volumen " +
  "autorizado de esa especie en m³, no el total), arboles (número de árboles autorizados).\n" +
  "- nota: breve, en español, sólo si algo es dudoso; si no, vacío.\n" +
  "Los números van como número JSON con punto decimal según cómo escriba el papel. No sumes ni completes filas.";

const texto = z.preprocess((v) => (v == null ? null : String(v)), z.string().nullable()).catch(null);
const numero = z.preprocess(aNumero, z.number().nullable()).catch(null);

export const ResolucionCrudaSchema = z.object({
  numero: texto.default(null),
  fecha: texto.default(null),
  vigenciaDesde: texto.default(null),
  vigenciaHasta: texto.default(null),
  titular: texto.default(null),
  autoridad: texto.default(null),
  especies: z
    .array(z.object({ nombreComun: texto.default(null), nombreCientifico: texto.default(null), volumenM3: numero.default(null), arboles: numero.default(null) }))
    .catch([])
    .default([]),
  nota: texto.default(null),
});
export type ResolucionCruda = z.infer<typeof ResolucionCrudaSchema>;

const T = { anyOf: [{ type: "string" }, { type: "null" }] };
const N = { anyOf: [{ type: "number" }, { type: "null" }] };
export const JSON_SCHEMA_RESOLUCION: Record<string, unknown> = {
  type: "object",
  properties: {
    numero: T,
    fecha: T,
    vigenciaDesde: T,
    vigenciaHasta: T,
    titular: T,
    autoridad: T,
    especies: {
      type: "array",
      items: {
        type: "object",
        properties: { nombreComun: T, nombreCientifico: T, volumenM3: N, arboles: { anyOf: [{ type: "integer" }, { type: "null" }] } },
        required: ["nombreComun", "nombreCientifico", "volumenM3", "arboles"],
        additionalProperties: false,
      },
    },
    nota: { type: "string" },
  },
  required: ["numero", "fecha", "vigenciaDesde", "vigenciaHasta", "titular", "autoridad", "especies", "nota"],
  additionalProperties: false,
};

/** La salida del modelo → la forma de acá, con rangos del mundo real. */
export function normalizarResolucion(c: ResolucionCruda): LecturaResolucion {
  const en = (n: number | null, max: number) => (n == null || n <= 0 || n > max ? null : n);
  const numeroLeido = c.numero ? codigoLimpio(c.numero) ?? limpiar(c.numero, 120) : null;
  return {
    numero: numeroLeido,
    codigoRegistro: null,
    fecha: fechaIso(c.fecha),
    vigenciaDesde: fechaIso(c.vigenciaDesde),
    vigenciaHasta: fechaIso(c.vigenciaHasta),
    titular: limpiar(c.titular),
    autoridad: limpiar(c.autoridad, 120),
    especies: c.especies
      .filter((e) => e.nombreComun || e.nombreCientifico)
      .slice(0, 40)
      .map((e) => ({
        especie: (limpiar(e.nombreComun, 80) ?? limpiar(e.nombreCientifico, 120) ?? "") as string,
        cientifico: limpiar(e.nombreCientifico, 120),
        volumenM3: en(e.volumenM3, 10_000_000),
        arboles: e.arboles != null && Number.isInteger(e.arboles) ? en(e.arboles, 10_000_000) : null,
      }))
      .filter((e) => e.especie),
    avisos: c.nota?.trim() ? [c.nota.trim().slice(0, 240)] : [],
  };
}
