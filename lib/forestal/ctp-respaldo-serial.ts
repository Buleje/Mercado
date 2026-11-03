/**
 * lib/forestal/ctp-respaldo-serial.ts — cómo se guarda una FOTO del Libro CTP
 * (ADR-530) y cómo vuelve, sin base: lo usan el servidor y los tests.
 *
 * Cada columna se escribe en JSON con una marca para los tipos que JSON no
 * tiene, así recuperar devuelve el tipo EXACTO que leyó Prisma:
 *   Decimal → `{ $d: "12.3400" }` · Date → `{ $t: ISO }` · BigInt → `{ $b }`
 *   · Bytes → `{ $y: base64 }` · columna Json (objeto) → `{ $j: valor }`.
 * Una columna Json con un número, un texto o una lista de textos va tal cual:
 * vuelve igual.
 */
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { TABLAS_RESPALDO, type ConteosRespaldo, type TablaRespaldo } from "@/lib/forestal/ctp-respaldo-tipos";

/** Versión del formato de `datos`. Subirla solo si cambia la forma, no por columnas nuevas. */
export const VERSION_RESPALDO = 1;

export type ValorSerial =
  | string
  | number
  | boolean
  | null
  | { $d: string }
  | { $t: string }
  | { $b: string }
  | { $y: string }
  | { $j: unknown }
  | ValorSerial[];

/** Una fila guardada: columna → valor marcado. Siempre trae `id`. */
export type FilaSerial = Record<string, ValorSerial>;

export type TablasSerial = Partial<Record<TablaRespaldo, FilaSerial[]>>;

/** Lo que va comprimido en `ForestCtpRespaldo.datos`. */
export interface ContenidoRespaldo {
  version: number;
  /** Columnas de cada tabla al guardar: recuperar inserta solo las que existen hoy. */
  columnas: Partial<Record<TablaRespaldo, string[]>>;
  tablas: TablasSerial;
}

const esDecimal = (v: object): v is { toFixed(): string } =>
  "d" in v && "e" in v && "s" in v && typeof (v as { toFixed?: unknown }).toFixed === "function";

const esPrimitivo = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** Un valor de columna, tal como lo devuelve Prisma, a su forma guardable. */
export function serializarValor(v: unknown): ValorSerial {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return { $b: v.toString() };
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : { $t: v.toISOString() };
  if (v instanceof Uint8Array) return { $y: Buffer.from(v).toString("base64") };
  if (Array.isArray(v)) {
    /* Lista de textos/números (columna lista o Json simple): tal cual. Con
       Date/Decimal adentro: elemento por elemento. Con objetos: es Json. */
    if (v.every(esPrimitivo)) return v as ValorSerial[];
    if (v.every((x) => esPrimitivo(x) || x instanceof Date || (typeof x === "object" && x !== null && esDecimal(x)))) {
      return v.map(serializarValor);
    }
    return { $j: v };
  }
  if (typeof v === "object") return esDecimal(v) ? { $d: v.toFixed() } : { $j: v };
  return null;
}

/** Cómo se rehidrata un Decimal (el servidor pasa `Prisma.Decimal`; los tests, nada → texto). */
export interface Hidratadores {
  decimal?: (texto: string) => unknown;
}

/** El inverso de `serializarValor`. */
export function hidratarValor(v: ValorSerial, h: Hidratadores = {}): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => hidratarValor(x, h));
  if ("$d" in v) return h.decimal ? h.decimal(v.$d) : v.$d;
  if ("$t" in v) return new Date(v.$t);
  if ("$b" in v) return BigInt(v.$b);
  if ("$y" in v) return new Uint8Array(Buffer.from(v.$y, "base64"));
  if ("$j" in v) return v.$j;
  return v;
}

export function serializarFila(fila: Record<string, unknown>): FilaSerial {
  const out: FilaSerial = {};
  for (const [k, v] of Object.entries(fila)) out[k] = serializarValor(v);
  return out;
}

/** JSON con las claves ordenadas: el mismo contenido da siempre el mismo texto. */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
    .join(",")}}`;
}

const porId = (a: FilaSerial, b: FilaSerial) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/** sha256 del contenido (filas ordenadas por id, tablas en el orden de `TABLAS_RESPALDO`). */
export function huellaDe(tablas: TablasSerial): string {
  const h = createHash("sha256");
  for (const t of TABLAS_RESPALDO) {
    h.update(`${t}\n`);
    for (const fila of [...(tablas[t] ?? [])].sort(porId)) h.update(`${canonico(fila)}\n`);
  }
  return h.digest("hex");
}

/** Dada de baja: `deletedAt` puesto, o corrida/salida anulada. */
export function esDeBaja(tabla: TablaRespaldo, fila: FilaSerial): boolean {
  if (fila.deletedAt != null) return true;
  return tabla === "ForestCtpEntry" && fila.status === "anulado";
}

export function conteosDe(tablas: TablasSerial): ConteosRespaldo {
  const out: ConteosRespaldo = {};
  for (const t of TABLAS_RESPALDO) {
    const filas = tablas[t] ?? [];
    out[t] = { total: filas.length, deBaja: filas.filter((f) => esDeBaja(t, f)).length };
  }
  return out;
}

export const filasDe = (c: ConteosRespaldo): number =>
  Object.values(c).reduce((s, x) => s + (x?.total ?? 0), 0);

export function comprimir(c: ContenidoRespaldo): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(c), "utf8"));
}

/** Tope al descomprimir: el libro más grande medido sale en pocos MB; 256 MB
    corta un archivo que se infla (bomba de gzip) antes de llenar la memoria. */
export const MAX_DESCOMPRIMIDO = 256 * 1024 * 1024;

export function descomprimir(datos: Uint8Array): ContenidoRespaldo {
  let crudo: Buffer;
  try {
    crudo = gunzipSync(Buffer.from(datos), { maxOutputLength: MAX_DESCOMPRIMIDO });
  } catch (e) {
    if (e instanceof RangeError) throw new Error(`respaldo ilegible: descomprimido pasa de ${MAX_DESCOMPRIMIDO / 1024 / 1024} MB`);
    throw e;
  }
  const c = JSON.parse(crudo.toString("utf8")) as ContenidoRespaldo;
  if (!c || typeof c !== "object" || typeof c.version !== "number" || typeof c.tablas !== "object") {
    throw new Error("respaldo ilegible: no tiene el formato del libro");
  }
  return c;
}

/** Texto de un valor marcado como fecha (o null). */
export function fechaDe(v: ValorSerial | undefined): Date | null {
  if (v && typeof v === "object" && !Array.isArray(v) && "$t" in v) {
    const d = new Date(v.$t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Número de un valor marcado como Decimal, número o texto numérico (o null). */
export function numeroDe(v: ValorSerial | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number.isFinite(Number(v)) ? Number(v) : null;
  if (typeof v === "object" && !Array.isArray(v) && "$d" in v) return Number(v.$d);
  return null;
}
