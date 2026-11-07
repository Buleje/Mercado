import "server-only";

/**
 * Buleje IA (ADR-528) — la llamada al modelo que eligió el negocio.
 *
 * `callLLMDelNegocio` es el `callLLM` de siempre con un paso antes: si el
 * negocio conectó su propio modelo (principal y activo), le habla a ese con su
 * clave; si no, o si su cuenta falla, cae a la IA de la plataforma
 * (`lib/llm-router`). Cada respuesta dice QUÉ modelo contestó (`modeloUsado`)
 * para que la app lo muestre chiquito.
 *
 * Fotos: viajan como partes `image` en el ÚLTIMO mensaje del usuario (el del
 * turno). Con fotos se usa `modeloVision ?? modelo`; si ese modelo no lee
 * fotos, o el negocio no tiene modelo propio (la plataforma no lee fotos), la
 * respuesta es `ok:false` con `error` que empieza con `sin_vision` y la frase
 * `FRASE_SIN_VISION` para la persona.
 */

import { callLLM, type LLMTier } from "@/lib/llm-router";
import { logger } from "@/lib/logger";
import { ERROR_SIN_VISION, type ChatMessage, type LLMCallOptions, type LLMResponse, type ParteContenido } from "@/lib/llm-providers/types";
import { IaProveedoresDB, type ProveedorConClave } from "@/lib/db/ia-proveedores.db";
import { chatConClave, conexionDe } from "./adaptador";
import { modeloLeeFotos } from "./catalogo";
import { esFallaDeCuenta } from "./errores";
import type { EstadoProveedorIa, ImagenTurno, ModeloUsado } from "./tipos";

export const FRASE_SIN_VISION = "Tu modelo no lee fotos: elige uno que sí en Modelos (Claude, ChatGPT, Gemini, Qwen VL…).";
export const FRASE_PLATAFORMA_SIN_VISION =
  "La IA de la plataforma no lee fotos: conecta tu propio modelo en Modelos (Claude, ChatGPT o Gemini) para que lea los recibos.";

export interface OpcionesNegocio {
  imagenes?: ImagenTurno[];
  /**
   * `true` = en este turno el modelo propio ya falló y se cayó a la plataforma:
   * no volver a esperarlo (hasta 60 s) en cada ronda. Con fotos no aplica
   * (la plataforma no las lee).
   */
  saltarPropio?: boolean;
}

export type RespuestaNegocio = LLMResponse & {
  modeloUsado: ModeloUsado;
  /** Estado del proveedor propio cuando se intentó (aunque después se haya caído a la plataforma). */
  estadoPropio?: EstadoProveedorIa;
};

/** Pega las fotos como partes `image` al último mensaje del usuario. */
export function conImagenes(messages: ChatMessage[], imagenes: ImagenTurno[]): ChatMessage[] {
  if (imagenes.length === 0) return messages;
  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") { idx = i; break; }
  }
  if (idx === -1) return messages;
  const m = messages[idx];
  const partes: ParteContenido[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : [...m.content];
  for (const img of imagenes) partes.push({ type: "image", mime: img.mime, base64: img.base64 });
  const copia = [...messages];
  copia[idx] = { ...m, content: partes };
  return copia;
}

function sinVision(proveedor: string, modelo: string, deLaPlataforma: boolean): RespuestaNegocio {
  return {
    ok: false,
    content: null,
    toolCalls: null,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    body: null,
    provider: "openai",
    model: modelo,
    error: `${ERROR_SIN_VISION} · ${deLaPlataforma ? FRASE_PLATAFORMA_SIN_VISION : FRASE_SIN_VISION}`,
    modeloUsado: { proveedor, modelo, deLaPlataforma },
  };
}

/** ¿El error es «este modelo no lee fotos»? (lo usa `conversar` para seguir sin la foto). */
export function esErrorSinVision(error: string | undefined): boolean {
  return typeof error === "string" && error.startsWith("sin_vision");
}

async function dePlataforma(tier: LLMTier, opts: LLMCallOptions, imagenes: ImagenTurno[]): Promise<RespuestaNegocio> {
  if (imagenes.length > 0) return sinVision("plataforma", "", true);
  const r = await callLLM(tier, opts);
  return { ...r, modeloUsado: { proveedor: r.provider, modelo: r.model, deLaPlataforma: true } };
}

function anotar(tenantId: string, id: string, estado: EstadoProveedorIa): void {
  IaProveedoresDB.anotarEstado(tenantId, id, estado).catch((err) =>
    logger.error("[ia-negocio] no se pudo anotar el estado del proveedor", { error: String(err), tenantId, id }),
  );
}

export async function callLLMDelNegocio(
  tenantId: string,
  tier: LLMTier,
  opts: LLMCallOptions,
  { imagenes = [], saltarPropio = false }: OpcionesNegocio = {},
): Promise<RespuestaNegocio> {
  if (saltarPropio && imagenes.length === 0) return dePlataforma(tier, opts, imagenes);
  let propio: ProveedorConClave | null = null;
  try {
    propio = await IaProveedoresDB.conClave(tenantId);
  } catch (err) {
    logger.error("[ia-negocio] no se pudo leer el proveedor del negocio", { error: String(err), tenantId });
  }
  if (!propio) return dePlataforma(tier, opts, imagenes);

  const { config, clave } = propio;
  const conFotos = imagenes.length > 0;
  const modelo = conFotos ? (config.modeloVision ?? config.modelo) : config.modelo;
  if (conFotos && !config.modeloVision && !modeloLeeFotos(config.proveedor, config.modelo)) {
    return sinVision(config.proveedor, modelo, false);
  }

  const con = conexionDe(config.proveedor, clave, config.baseUrl);
  if (!con.ok) {
    anotar(tenantId, config.id, con.estado);
    return conFotos ? sinVision(config.proveedor, modelo, false) : { ...(await dePlataforma(tier, opts, [])), estadoPropio: con.estado };
  }

  const mensajes = conFotos ? conImagenes(opts.messages, imagenes) : opts.messages;
  const r = await chatConClave(con.conexion, { ...opts, messages: mensajes }, modelo);
  const modeloUsado: ModeloUsado = { proveedor: config.proveedor, modelo, deLaPlataforma: false };

  if (r.ok) {
    if (config.ultimoEstado !== "ok") anotar(tenantId, config.id, "ok");
    return { ...r, modeloUsado, estadoPropio: "ok" };
  }

  logger.warn("[ia-negocio] el modelo del negocio falló", { tenantId, proveedor: config.proveedor, modelo, estado: r.estado });
  if (esFallaDeCuenta(r.estado)) anotar(tenantId, config.id, r.estado);

  /*
   * Con fotos no hay a dónde caer (la plataforma no lee fotos): se devuelve el
   * error del proveedor tal cual. Sin fotos, la plataforma contesta para que el
   * dueño no se quede sin asistente; `modeloUsado.deLaPlataforma` lo delata y
   * `ultimoEstado` queda en la tarjeta de Modelos.
   */
  if (conFotos) {
    return { ...r, modeloUsado, estadoPropio: r.estado };
  }
  const plataforma = await dePlataforma(tier, opts, []);
  return { ...plataforma, estadoPropio: r.estado };
}
