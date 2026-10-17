/**
 * lib/integrations/placa-peru.ts
 *
 * Consulta vehicular por placa (SUNARP) a través de un proveedor con token.
 *
 * Por qué (Brandon 29-09-2026: «hacer uso de API que permita buscar
 * información de la placa y ponerse esos datos»): la marca, el modelo y el
 * color del camión los publica SUNARP; tipearlos a mano en cada guía es donde
 * nace la placa inventada.
 *
 * Provider por `PLACA_API_PROVIDER` (default `jsonpe`):
 *   "jsonpe" — api.json.pe · POST /api/placa · `Authorization: Bearer <token>`
 *              · body `{ "placa": "ABC123" }` → `{ success, message, data: {
 *              placa, marca, modelo, serie, color, motor, vin } }`. 100 créditos
 *              gratis cada 30 días y 5 por consulta = 20 placas al mes.
 *
 * Sin `PLACA_API_TOKEN` NO se sale a la red: `{ estado: "sin_clave" }` y la
 * pantalla busca sólo en las guías y el Directorio del negocio.
 *
 * Caché de 30 días por placa, COMPARTIDA entre negocios: es el registro
 * público del vehículo (no dice qué negocio lo consultó) y cada consulta cuesta
 * créditos. Una placa que el proveedor no encuentra se recuerda 7 días; un error
 * (timeout, token vencido) no se recuerda. Dónde vive y el tope de consultas
 * pagas por negocio (10 por día y 60 por mes, `PLACA_API_TOPE_DIA/_MES`):
 * `placa-peru-store.ts`. Lo que sale de la caché no cuenta para el tope.
 */

import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { DatosPlacaExterna } from "@/lib/forestal/placa-historial";
import { guardarCachePlaca, leerCachePlaca, reservarConsulta, topeConsultas, type Cacheada, type TopeAlcanzado } from "./placa-peru-store";

const TIMEOUT_MS = 8000;
const DIA_MS = 24 * 60 * 60 * 1000;
const VIGENCIA_ENCONTRADA_MS = 30 * DIA_MS;
const VIGENCIA_NO_ENCONTRADA_MS = 7 * DIA_MS;
const JSONPE_URL = "https://api.json.pe/api/placa";

export type ResultadoPlacaExterna =
  | { estado: "sin_clave" }
  | { estado: "encontrada"; datos: DatosPlacaExterna; fuente: "json.pe"; consultadoEn: string; desdeCache: boolean }
  | { estado: "no_encontrada"; fuente: "json.pe"; consultadoEn: string; desdeCache: boolean }
  /**
   * Ya se gastaron las consultas pagas del negocio (día o mes) o de la
   * plataforma (mes): la búsqueda sigue sin SUNARP.
   */
  | { estado: "tope"; alcanzado: TopeAlcanzado; tope: number; motivo: string }
  /** No se gastó una consulta: el negocio ya sabe la marca de esa placa. */
  | { estado: "omitida"; motivo: string }
  | { estado: "error"; motivo: string; credenciales: boolean };

/** Hay con qué consultar. La pantalla lo usa para decir por qué no hay SUNARP. */
export function placaExternaDisponible(): boolean {
  return Boolean(process.env.PLACA_API_TOKEN?.trim());
}

// ── Parser (puro, exportado para los tests) ─────────────────────────────────

const textoOpcional = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => {
    const s = v == null ? "" : String(v).trim();
    return s && !/^[-—\s]+$/.test(s) ? s.slice(0, 80) : null;
  });

const respuestaJsonPe = z.object({
  success: z.boolean(),
  message: z.string().nullish(),
  data: z
    .object({
      placa: textoOpcional,
      marca: textoOpcional,
      modelo: textoOpcional,
      serie: textoOpcional,
      color: textoOpcional,
      motor: textoOpcional,
      vin: textoOpcional,
    })
    .nullish(),
});

export type LecturaJsonPe = { tipo: "datos"; datos: DatosPlacaExterna } | { tipo: "sin_datos"; mensaje: string | null };

/**
 * Lee la respuesta de json.pe SIN tirar. `null` = no tiene la forma esperada
 * (el proveedor cambió el contrato): quien llama lo trata como error, no como
 * «no existe».
 */
export function parsearRespuestaJsonPe(json: unknown, placa: string): LecturaJsonPe | null {
  const r = respuestaJsonPe.safeParse(json);
  if (!r.success) return null;
  const { success, message, data } = r.data;
  if (!success) return { tipo: "sin_datos", mensaje: message ?? null };
  if (!data) return null;
  // Una respuesta «exitosa» sin marca ni modelo no identifica a ningún vehículo.
  if (!data.marca && !data.modelo) return { tipo: "sin_datos", mensaje: message ?? null };
  return {
    tipo: "datos",
    datos: {
      placa: data.placa ?? placa,
      marca: data.marca,
      modelo: data.modelo,
      color: data.color,
      serie: data.serie,
      motor: data.motor,
      vin: data.vin,
    },
  };
}

// ── Caché ───────────────────────────────────────────────────────────────────

async function leerCache(placa: string, ahora: number): Promise<Cacheada | null> {
  try {
    const c = await leerCachePlaca(placa);
    if (!c) return null;
    const edad = ahora - Date.parse(c.consultadoEn);
    const vigencia = c.encontrada ? VIGENCIA_ENCONTRADA_MS : VIGENCIA_NO_ENCONTRADA_MS;
    return Number.isFinite(edad) && edad >= 0 && edad < vigencia ? c : null;
  } catch (err) {
    logger.warn("[placa-externa] no se pudo leer la caché", { placa, error: String(err) });
    return null;
  }
}

/** «10 consultas de hoy» / «60 del mes»: lo que dice la línea de la búsqueda. */
function motivoTope(alcanzado: TopeAlcanzado, tope: number): string {
  if (tope <= 0) return "La consulta a SUNARP está apagada: se buscó sólo en tus guías y el Directorio.";
  if (alcanzado === "global") {
    return `Se acabaron las ${tope} consultas a SUNARP del mes de la cuenta: se buscó sólo en tus guías y el Directorio.`;
  }
  const cuando = alcanzado === "dia" ? "de hoy" : "del mes";
  return `Ya se usaron las ${tope} consultas a SUNARP ${cuando}: se buscó sólo en tus guías y el Directorio.`;
}

/** Lo que dice la pantalla cuando el proveedor rechaza la clave o se quedó sin créditos. */
export const MOTIVO_CLAVE_RECHAZADA = "La clave de SUNARP fue rechazada: revisa PLACA_API_TOKEN.";
export const MOTIVO_SIN_CREDITOS = "La cuenta de consultas se quedó sin créditos.";
export const MOTIVO_OMITIDA = "Tus guías ya traen la marca de esta placa: no se gastó una consulta a SUNARP.";

// ── Consulta ────────────────────────────────────────────────────────────────

/**
 * Consulta la placa (ya normalizada, `W2D853`) para el negocio `tenantId`, que
 * es a quien se le cuenta la consulta. Nunca tira: todo termina en uno de los
 * seis estados.
 *
 * `soloCache`: el negocio ya sabe la marca (Directorio o una guía): se muestra
 * lo que SUNARP haya dicho antes de esa placa, pero no se gasta una consulta.
 */
export async function consultarPlacaExterna(
  tenantId: string,
  placa: string,
  ahora: number = Date.now(),
  opciones: { soloCache?: boolean } = {},
): Promise<ResultadoPlacaExterna> {
  const token = process.env.PLACA_API_TOKEN?.trim();
  if (!token) return { estado: "sin_clave" };
  // Vacío = default (una variable puesta en blanco en Vercel no rompe nada).
  const proveedor = (process.env.PLACA_API_PROVIDER?.trim() || "jsonpe").toLowerCase();
  if (proveedor !== "jsonpe") {
    return { estado: "error", motivo: `PLACA_API_PROVIDER «${proveedor}» no está soportado (usa jsonpe).`, credenciales: true };
  }

  const cache = await leerCache(placa, ahora);
  if (cache) {
    return cache.encontrada && cache.datos
      ? { estado: "encontrada", datos: cache.datos, fuente: "json.pe", consultadoEn: cache.consultadoEn, desdeCache: true }
      : { estado: "no_encontrada", fuente: "json.pe", consultadoEn: cache.consultadoEn, desdeCache: true };
  }
  if (opciones.soloCache) return { estado: "omitida", motivo: MOTIVO_OMITIDA };

  // Recién acá se gasta un crédito: se aparta la consulta del tope del negocio.
  let reserva: Awaited<ReturnType<typeof reservarConsulta>>;
  try {
    reserva = await reservarConsulta(tenantId, ahora, topeConsultas());
  } catch (err) {
    logger.warn("[placa-externa] no se pudo contar la consulta", { tenantId, placa, error: String(err) });
    return { estado: "error", motivo: "No se pudo llevar la cuenta de consultas a SUNARP: prueba en un rato.", credenciales: false };
  }
  if (!reserva.ok) {
    return { estado: "tope", alcanzado: reserva.alcanzado, tope: reserva.tope, motivo: motivoTope(reserva.alcanzado, reserva.tope) };
  }
  /**
   * Lo que el proveedor no cobra no gasta el tope: red caída, timeout, 5xx,
   * clave rechazada y cuenta sin créditos. Sin esto, 10 búsquedas con la clave
   * vencida agotaban el día y la pantalla decía «ya se usaron las 10 de hoy»,
   * escondiendo que el problema era la clave.
   */
  const devolver = () =>
    reserva.ok
      ? reserva.liberar().catch((err) => logger.warn("[placa-externa] no se pudo devolver la consulta al tope", { tenantId, error: String(err) }))
      : Promise.resolve();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let lectura: LecturaJsonPe | null;
  try {
    const res = await fetch(JSONPE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Buleje/1.0 (+https://www.buleje.pe)",
      },
      body: JSON.stringify({ placa }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      await devolver();
      logger.warn("[placa-externa] clave rechazada por el proveedor", { status: res.status });
      return { estado: "error", motivo: MOTIVO_CLAVE_RECHAZADA, credenciales: true };
    }
    if (res.status === 402 || res.status === 429) {
      await devolver();
      logger.warn("[placa-externa] cuenta del proveedor sin créditos", { status: res.status });
      return { estado: "error", motivo: MOTIVO_SIN_CREDITOS, credenciales: true };
    }
    const json: unknown = await res.json().catch(() => null);
    // json.pe contesta 400/404 con `{ success: false, message }` cuando la placa no está.
    lectura = parsearRespuestaJsonPe(json, placa);
    // Un 5xx con `{ success:false, message:"error interno" }` es una caída del
    // proveedor, no «esta placa no existe»: cachearlo 7 días le diría al
    // operador «SUNARP no tiene esta placa» de un camión real.
    if (res.status >= 500) {
      await devolver();
      return { estado: "error", motivo: `El proveedor de placas respondió ${res.status}. Prueba de nuevo en un rato.`, credenciales: false };
    }
    if (!lectura && !res.ok) {
      return { estado: "error", motivo: `El proveedor de placas respondió ${res.status}.`, credenciales: false };
    }
  } catch (err) {
    const abortado = err instanceof Error && err.name === "AbortError";
    logger.warn("[placa-externa] consulta fallida", { placa, abortado, error: String(err) });
    await devolver();
    return {
      estado: "error",
      motivo: abortado ? "SUNARP no contestó en 8 s. Prueba de nuevo en un rato." : "No se pudo consultar la placa en SUNARP.",
      credenciales: false,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!lectura) {
    logger.warn("[placa-externa] respuesta con forma inesperada", { placa });
    return { estado: "error", motivo: "El proveedor de placas respondió algo que no se pudo leer.", credenciales: false };
  }

  const consultadoEn = new Date(ahora).toISOString();
  const guardar: Cacheada =
    lectura.tipo === "datos"
      ? { consultadoEn, encontrada: true, datos: lectura.datos }
      : { consultadoEn, encontrada: false, datos: null };
  // Fire-and-forget: sin caché la próxima consulta gasta créditos, pero la de
  // ahora ya tiene su respuesta.
  const ttlSeg = (lectura.tipo === "datos" ? VIGENCIA_ENCONTRADA_MS : VIGENCIA_NO_ENCONTRADA_MS) / 1000;
  guardarCachePlaca(placa, guardar, ttlSeg, ahora).catch((err) =>
    logger.warn("[placa-externa] no se pudo guardar la caché", { placa, error: String(err) }),
  );

  return lectura.tipo === "datos"
    ? { estado: "encontrada", datos: lectura.datos, fuente: "json.pe", consultadoEn, desdeCache: false }
    : { estado: "no_encontrada", fuente: "json.pe", consultadoEn, desdeCache: false };
}
