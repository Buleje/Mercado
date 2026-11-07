/**
 * Tipo de cambio del dólar (S/ por US$) para documentos en dólares — 04-11-2026.
 *
 * Por qué: una factura de proveedor en dólares (p. ej. la que llega por XML en
 * Compras) hoy se lee como si fueran soles, y la contabilidad la deja fuera
 * («otras_monedas»). SUNAT pide convertir con el tipo de cambio que ELLA publica
 * para la fecha del comprobante (compra para ventas, venta para compras).
 *
 * Fuentes públicas, sin clave (medido 04-11-2026 00:45):
 *   · SUNAT, solo el de HOY: https://www.sunat.gob.pe/a/txt/tipoCambio.txt
 *     → «04/11/2026|3.459|3.466|» (fecha|compra|venta). Su histórico pide captcha.
 *   · BCRP, series PD04639PD (compra) y PD04640PD (venta) = «TC Sistema bancario
 *     SBS», que es la fuente que SUNAT publica: lo que SUNAT muestra el día D es el
 *     cierre SBS del último día hábil ANTERIOR a D. Para fechas pasadas se usa eso
 *     y se dice que es el cierre SBS de tal día (derivado, no el texto de SUNAT).
 */
import "server-only";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";

export interface TipoCambio {
  /** Fecha pedida (YYYY-MM-DD, Lima). */
  fecha: string;
  compra: number;
  venta: number;
  fuente: "sunat" | "bcrp-sbs";
  /** Día del dato: el mismo `fecha` si es SUNAT; el cierre SBS usado si es BCRP. */
  fechaDato: string;
  /** Frase lista para mostrar: «SUNAT del 04-11» o «SBS al cierre del 02-11 (BCRP)». */
  detalle: string;
}

const URL_SUNAT = "https://www.sunat.gob.pe/a/txt/tipoCambio.txt";
const URL_BCRP = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04639PD-PD04640PD/json";
const TIMEOUT_MS = 6000;
/* Rango creíble del sol: fuera de esto la lectura está mal (no se guarda). */
const MIN_CREIBLE = 2.5;
const MAX_CREIBLE = 5.5;

const MESES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

function creible(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_CREIBLE && n <= MAX_CREIBLE;
}

function ddmm(fechaIso: string): string {
  const [, m, d] = fechaIso.split("-");
  return `${d}-${m}`;
}

/** Hoy en Lima como YYYY-MM-DD. */
export function hoyLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(ahora);
}

function restarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** «04/11/2026|3.459|3.466|» → { fecha: "2026-11-04", compra, venta } o null. */
export function leerTextoSunat(texto: string): { fecha: string; compra: number; venta: number } | null {
  const m = texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\|([\d.]+)\|([\d.]+)\|?/);
  if (!m) return null;
  const compra = Number(m[4]);
  const venta = Number(m[5]);
  if (!creible(compra) || !creible(venta)) return null;
  return { fecha: `${m[3]}-${m[2]}-${m[1]}`, compra, venta };
}

/** «27.Oct.26» → «2026-10-27» (meses en español; «Set» o «Sep»). */
export function leerPeriodoBcrp(nombre: string): string | null {
  const m = nombre.trim().match(/^(\d{1,2})\.([A-Za-z]{3})\.(\d{2})$/);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return `20${m[3]}-${mes}-${m[1].padStart(2, "0")}`;
}

interface RespuestaBcrp {
  periods?: Array<{ name?: string; values?: string[] }>;
}

/**
 * Último cierre con cifras ANTES de `fecha` (los días sin dato vienen «n.d.»).
 * Es lo que SUNAT publica para `fecha`.
 */
export function cierreSbsAnteriorA(
  json: RespuestaBcrp,
  fecha: string,
): { fechaDato: string; compra: number; venta: number } | null {
  let mejor: { fechaDato: string; compra: number; venta: number } | null = null;
  for (const p of json.periods ?? []) {
    const dia = p.name ? leerPeriodoBcrp(p.name) : null;
    if (!dia || dia >= fecha) continue;
    const compra = Number(p.values?.[0]);
    const venta = Number(p.values?.[1]);
    if (!creible(compra) || !creible(venta)) continue;
    if (!mejor || dia > mejor.fechaDato) mejor = { fechaDato: dia, compra, venta };
  }
  return mejor;
}

async function traer(url: string, accept = "*/*"): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0", Accept: accept },
      cache: "no-store",
    });
    return res.ok ? res : null;
  } catch (err) {
    logger.warn("[tipo-cambio] no respondió", { url, err: String(err) });
    return null;
  }
}

/* El BCRP, ante pedidos seguidos, a veces contesta 200 con una página HTML de
   «verificando navegador» en vez del JSON (medido 04-11: 2 de 3 seguidos). Con
   Accept JSON y un segundo intento a los 1,5 s responde bien. */
async function traerBcrp(url: string): Promise<RespuestaBcrp | null> {
  for (let intento = 1; intento <= 2; intento++) {
    const res = await traer(url, "application/json");
    const texto = res ? await res.text() : "";
    if (texto.trimStart().startsWith("{")) {
      try {
        return JSON.parse(texto) as RespuestaBcrp;
      } catch (err) {
        logger.warn("[tipo-cambio] JSON del BCRP mal formado", { err: String(err) });
        return null;
      }
    }
    if (intento === 1) await new Promise((r) => setTimeout(r, 1500));
  }
  logger.warn("[tipo-cambio] BCRP no devolvió JSON en 2 intentos", { url });
  return null;
}

/**
 * Tipo de cambio que SUNAT publica para `fecha` (YYYY-MM-DD). null si ninguna
 * fuente respondió o la fecha es futura. Caché: 1 h el de hoy, 7 días el pasado.
 */
export async function tipoCambioDelDia(fecha: string, ahora: Date = new Date()): Promise<TipoCambio | null> {
  const hoy = hoyLima(ahora);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy) return null;

  const clave = `tipo-cambio:${fecha}`;
  const guardado = cacheStore.get<TipoCambio>(clave);
  if (guardado) return guardado;

  let resultado: TipoCambio | null = null;

  if (fecha === hoy) {
    const res = await traer(URL_SUNAT);
    const leido = res ? leerTextoSunat(await res.text()) : null;
    if (leido && leido.fecha === fecha) {
      resultado = {
        fecha,
        compra: leido.compra,
        venta: leido.venta,
        fuente: "sunat",
        fechaDato: fecha,
        detalle: `SUNAT del ${ddmm(fecha)}`,
      };
    }
  }

  if (!resultado) {
    const json = await traerBcrp(`${URL_BCRP}/${restarDias(fecha, 14)}/${restarDias(fecha, 1)}`);
    const cierre = json ? cierreSbsAnteriorA(json, fecha) : null;
    if (cierre) {
      resultado = {
        fecha,
        compra: cierre.compra,
        venta: cierre.venta,
        fuente: "bcrp-sbs",
        fechaDato: cierre.fechaDato,
        detalle: `SBS al cierre del ${ddmm(cierre.fechaDato)} (BCRP)`,
      };
    }
  }

  if (resultado) cacheStore.set(clave, resultado, fecha === hoy ? 60 * 60 : 7 * 24 * 60 * 60);
  return resultado;
}

/** Monto en dólares → soles con 2 decimales (venta para compras, compra para ventas). */
export function aSoles(montoUsd: number, tc: TipoCambio, uso: "compra" | "venta"): number {
  const tasa = uso === "compra" ? tc.venta : tc.compra;
  return Math.round(montoUsd * tasa * 100) / 100;
}
