/**
 * reparto-bloques-import — una planilla de bloques → filas de la distribución.
 *
 * Cargar veinte guías a mano, fila por fila, es media hora de tipeo y la
 * primera fuente de que el papel diga un número y el Libro otro. Acá se pega
 * (o se sube) la planilla que el aserradero ya lleva y salen los bloques.
 *
 * ── Qué se lee ──────────────────────────────────────────────────────────────
 * La cabecera se reconoce por NOMBRE, sin importar el orden ni las tildes ni
 * las mayúsculas (`sinAcentos`, el mismo criterio del importador de piezas).
 * Sin cabecera reconocible se asume el orden de la plantilla, que es el mismo
 * de la tabla en pantalla.
 *
 * ── Lo que NO hace, a propósito ─────────────────────────────────────────────
 * · **No completa el % aprovechable.** Vacío es vacío: el reparto ya sabe que
 *   sin dato usa su supuesto y lo dice en pantalla con el borde punteado.
 *   Escribir 55 acá haría pasar por medido un número que nadie midió.
 * · **No adivina el tipo de bloque.** Si la columna no está, todo entra como
 *   ROLLIZA — que es lo que era antes de que existiera la otra forma, y lo que
 *   la planilla vieja de cualquiera significa.
 * · **No descarta la fila que no entiende: la reporta.** Una fila perdida en
 *   silencio es exactamente el bug del importador de trozas
 *   ([[ctp-import-inventarios-2026-08-05]]), donde 51 de 60 se fueron sin que
 *   nadie lo viera. Acá cada descarte trae su número de fila y su motivo.
 *
 * PURO y client-safe: sin React, sin fetch, sin DOM.
 */

import { aNumero, normalizarEspecie, sinAcentos, type Celda } from "./cubicacion-import";
import type { BloqueRolliza } from "./cubicacion-reparto";

/** Un bloque leído, listo para entrar a la tabla (le falta sólo el `id`). */
export type BloqueImportado = Omit<BloqueRolliza, "id">;

/** Fila que no entró, con el número que se ve en el Excel y el porqué. */
export interface FilaDescartada {
  fila: number;
  motivo: string;
  /** La fila cruda, recortada — para reconocerla sin abrir el archivo. */
  crudo: string;
}

export interface ResultadoImportBloques {
  bloques: BloqueImportado[];
  descartadas: FilaDescartada[];
  /** `true` si la primera fila se reconoció como cabecera y se salteó. */
  conCabecera: boolean;
  /** Columnas de la cabecera que no se reconocieron (se ignoran, se avisan). */
  columnasIgnoradas: string[];
}

/** Los campos que sabe leer, con los nombres que puede traer cada uno. */
type Campo = "etiqueta" | "tipo" | "especie" | "permiso" | "m3" | "piezas" | "aprovechable" | "costo" | "dias" | "fecha";

const ALIAS: Record<Campo, string[]> = {
  etiqueta: ["etiqueta", "bloque", "gtf", "guia", "lote", "codigo", "referencia"],
  tipo: ["tipo", "cargado como", "cargado", "clase", "forma", "origen"],
  especie: ["especie", "madera", "nombre comun"],
  permiso: ["permiso", "n permiso", "no permiso", "titulo", "titulo habilitante", "th"],
  m3: ["m3", "m3 r", "m3 a", "m3 r / a", "volumen", "volumen m3", "metros cubicos", "rolliza", "rolliza m3"],
  piezas: ["piezas", "pzas", "cantidad", "n piezas", "tablas"],
  aprovechable: ["aprovechable", "% aprovechable", "porcentaje aprovechable", "rendimiento", "aprovechamiento"],
  costo: ["costo", "s/ por m3", "s por m3", "precio", "costo m3", "soles por m3"],
  dias: ["dias", "jornadas", "n dias"],
  fecha: ["fecha", "fecha de aserrio", "dia"],
};

/** El orden de la plantilla, para una planilla sin cabecera. */
const ORDEN_PLANTILLA: Campo[] = ["etiqueta", "tipo", "especie", "permiso", "m3", "piezas", "aprovechable", "costo", "dias", "fecha"];

/** Cabecera sugerida de la plantilla descargable — misma que lee `mapaDeCabecera`. */
export const PLANTILLA_BLOQUES: { headers: string[]; ejemplo: (string | number)[][] } = {
  headers: ["Etiqueta (GTF / lote)", "Cargado como", "Especie", "N° de permiso", "m³ (R / A)", "Piezas", "% aprovechable", "S/ por m³", "Días", "Fecha"],
  ejemplo: [
    ["GTF-0231", "rolliza", "Tornillo", "19-SEC/REG-2024-021", 20, "", 55, "", 1, "2026-09-01"],
    ["Compra 12/08", "aserrada", "Tornillo", "", 1.5, 30, "", "", 1, "2026-09-01"],
  ],
};

/** ¿Esta celda dice «madera ya aserrada»? Todo lo demás es rolliza. */
function tipoDeCelda(v: Celda): "rolliza" | "aserrada" {
  const t = sinAcentos(String(v ?? ""));
  if (!t) return "rolliza";
  // «aserrada directa», «aserrado», «ya aserrada», «A»… todo lo que nombre la
  // madera que ya salió de la sierra. «rolliza», «troza», «R» y el vacío, no.
  if (/(^|[^a-z])a$/.test(t)) return "aserrada";
  return /aserr/.test(t) ? "aserrada" : "rolliza";
}

/**
 * El título de una columna, normalizado para compararlo.
 *
 * `m³` y `m3` son la misma columna y nadie escribe siempre igual; los `°`, los
 * paréntesis y los puntos son adorno. Sin esto, la propia plantilla que
 * descarga el módulo («m³ (R / A)», «N° de permiso») no se reconocía a sí
 * misma — el primer test que se escribió lo destapó.
 */
const tituloNormalizado = (c: Celda): string =>
  sinAcentos(String(c ?? ""))
    .replace(/³/g, "3").replace(/²/g, "2")
    .replace(/[°º.:()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A qué campo corresponde un título. Gana el alias MÁS LARGO que calce: sin
 * eso, «costo m3» se leería como la columna de volumen (por el «m3» adentro) y
 * el costo entraría como metros cúbicos.
 */
function campoDeTitulo(titulo: string): Campo | null {
  let mejor: { campo: Campo; largo: number } | null = null;
  for (const campo of Object.keys(ALIAS) as Campo[]) {
    for (const alias of ALIAS[campo]) {
      // Palabra completa: «dia» no puede matchear dentro de «diametro».
      const calza = titulo === alias || new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^a-z0-9]|$)`).test(titulo);
      if (calza && (!mejor || alias.length > mejor.largo)) mejor = { campo, largo: alias.length };
    }
  }
  return mejor?.campo ?? null;
}

/** Qué columna es cada una, por nombre. `null` = no se reconoció. */
function mapaDeCabecera(fila: Celda[]): { mapa: (Campo | null)[]; reconocidas: number; ignoradas: string[] } {
  const ignoradas: string[] = [];
  let reconocidas = 0;
  const vistos = new Set<Campo>();
  const mapa = fila.map((c): Campo | null => {
    const t = tituloNormalizado(c);
    if (!t) return null;
    const campo = campoDeTitulo(t);
    /* Dos columnas que dicen lo mismo: manda la PRIMERA. La segunda se avisa
       como ignorada en vez de pisar en silencio a la que ya se estaba leyendo. */
    if (campo && !vistos.has(campo)) { vistos.add(campo); reconocidas++; return campo; }
    ignoradas.push(String(c ?? "").trim());
    return null;
  });
  return { mapa, reconocidas, ignoradas };
}

/** Una fecha de planilla → `AAAA-MM-DD`, o `null` si no se entiende. */
function fechaISO(v: Celda): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/aaaa y dd-mm-aaaa, que es como se escribe acá.
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  /* Una celda con formato de fecha llega desde exceljs ya pasada por `String()`
     («Tue Sep 01 2026 00:00:00 GMT+0000»), porque `Celda` sólo admite texto o
     número. Se lee en UTC a propósito: estas fechas son date-only y tomarlas en
     hora local corre el día para atrás en Lima ([[fecha-sin-hora-setutchours]]). */
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** Un entero no negativo, o `null` si la celda está vacía o no es número. */
function entero(v: Celda): number | null {
  const n = aNumero(v);
  if (n == null) return null;
  return Math.max(0, Math.floor(n));
}

/**
 * Lee la matriz a bloques.
 *
 * Cada fila necesita, como mínimo, un **m³ mayor que cero**: un bloque sin
 * volumen no ampara nada y sólo ensucia la tabla. Todo lo demás es opcional —
 * la etiqueta se completa después, contra el papel real.
 */
export function parsearBloquesImportados(matriz: readonly Celda[][]): ResultadoImportBloques {
  const filas = matriz.filter((f) => f.some((c) => String(c ?? "").trim() !== ""));
  if (filas.length === 0) {
    return { bloques: [], descartadas: [], conCabecera: false, columnasIgnoradas: [] };
  }

  const cab = mapaDeCabecera(filas[0]);
  /*
   * Cabecera = dos columnas reconocidas Y **ninguna celda numérica**.
   *
   * Lo segundo no es paranoia: una fila de datos real («GTF-1 | rolliza |
   * Cedro | | 8») calza dos alias sin ser cabecera —«GTF» es alias de etiqueta
   * y «rolliza» de volumen—, y tomarla por títulos se comía el primer bloque
   * del archivo en silencio. Una cabecera de verdad es todo texto; un 8 suelto
   * en la primera fila es un dato, no un rótulo.
   */
  const hayNumeros = filas[0].some((c) => aNumero(c) != null);
  const conCabecera = cab.reconocidas >= 2 && !hayNumeros;
  const mapa = conCabecera ? cab.mapa : ORDEN_PLANTILLA.map((c) => c as Campo | null);
  const cuerpo = conCabecera ? filas.slice(1) : filas;
  const offset = conCabecera ? 2 : 1; // el N° de fila que se ve en el Excel

  const bloques: BloqueImportado[] = [];
  const descartadas: FilaDescartada[] = [];

  cuerpo.forEach((f, i) => {
    const nFila = i + offset;
    const crudo = f.map((c) => String(c ?? "").trim()).filter(Boolean).join(" | ").slice(0, 120);
    const val = (campo: Campo): Celda => {
      const idx = mapa.indexOf(campo);
      return idx >= 0 ? f[idx] : null;
    };

    const m3 = aNumero(val("m3"));
    if (m3 == null || m3 <= 0) {
      descartadas.push({ fila: nFila, motivo: m3 == null ? "sin m³ (la columna de volumen está vacía o no es un número)" : "el m³ es 0 o negativo", crudo });
      return;
    }

    const tipo = tipoDeCelda(val("tipo"));
    const aprov = aNumero(val("aprovechable"));
    const costo = aNumero(val("costo"));
    const dias = entero(val("dias"));
    const piezas = entero(val("piezas"));
    const permiso = String(val("permiso") ?? "").trim();

    bloques.push({
      etiqueta: String(val("etiqueta") ?? "").trim().slice(0, 120),
      especie: normalizarEspecie(val("especie")) ?? "",
      m3,
      permiso: permiso || null,
      origen: "manual",
      tipo,
      /* En un bloque de aserrada directa el % no aplica: guardarlo dejaría un
         número muerto que reaparece si alguien cambia la fila a rolliza. */
      aprovechablePct: tipo === "aserrada" ? null : aprov,
      costoM3: costo,
      piezasManual: piezas,
      dias: dias && dias >= 1 ? dias : null,
      fecha: fechaISO(val("fecha")),
    });
  });

  return { bloques, descartadas, conCabecera, columnasIgnoradas: conCabecera ? cab.ignoradas : [] };
}
