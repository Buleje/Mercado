import "server-only";

/**
 * Buleje IA (ADR-528) — hablarle a cualquier proveedor con la clave DEL NEGOCIO.
 *
 * Dos protocolos alcanzan para los 12 del catálogo: casi todos copian la API de
 * OpenAI (`/chat/completions`, `/models`); Claude tiene la suya (`/messages`).
 * La clave llega explícita (descifrada por `IaProveedoresDB`), nunca del
 * entorno, y no se loguea nunca.
 *
 * Diferencias con `lib/llm-providers/anthropic.ts` (que sigue siendo el de la
 * plataforma): acá los `tool_result` llevan `tool_use_id` y los mensajes del
 * asistente con `tool_calls` se traducen a bloques `tool_use` — sin eso Claude
 * contesta 400 en la 2.ª vuelta de herramientas.
 */

import { safeFetch } from "@/lib/safe-fetch";
import type { LLMCallOptions, LLMResponse, ToolCallResult } from "@/lib/llm-providers/types";
import { aMensajesAnthropic, aMensajesOpenAI, aToolsAnthropic } from "./traduccion";
import { estadoDeExcepcion, estadoDeHttp, mensajeDeEstado } from "./errores";
import { modeloLeeFotos, proveedorDelCatalogo, validarBaseUrl } from "./catalogo";
import type { EstadoProveedorIa, ProtocoloIa, ProveedorIaId, ResultadoPrueba } from "./tipos";

export { aMensajesAnthropic, aMensajesOpenAI, aToolsAnthropic } from "./traduccion";

const ANTHROPIC_VERSION = "2023-06-01";
/** Una respuesta con herramientas tarda 2-20 s; 60 s es «se colgó». */
const TIMEOUT_CHAT_MS = 60_000;
const TIMEOUT_PRUEBA_MS = 15_000;

export interface ConexionIa {
  proveedor: ProveedorIaId;
  nombre: string;
  protocolo: ProtocoloIa;
  /** Sin barra final. Anthropic: `https://api.anthropic.com/v1`. */
  baseUrl: string;
  clave: string;
  /** La dirección la escribió el dueño: se llama con `safeFetch` (DNS resuelto, sin redirecciones). */
  urlDelDueno: boolean;
}

export type ResultadoConexion = { ok: true; conexion: ConexionIa } | { ok: false; estado: EstadoProveedorIa; mensaje: string };

export function esProduccion(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

/**
 * Arma la conexión. `baseUrl` solo cuenta si la escribió el dueño
 * (personalizado u otra región); pasa por la validación anti-SSRF.
 */
export function conexionDe(proveedor: ProveedorIaId, clave: string, baseUrl?: string | null): ResultadoConexion {
  const cat = proveedorDelCatalogo(proveedor);
  if (!cat) return { ok: false, estado: "error", mensaje: "Ese proveedor no está en la lista." };
  const propia = baseUrl?.trim() || null;
  if (!propia && !cat.baseUrl) {
    return { ok: false, estado: "error", mensaje: "Falta la dirección del servicio (https://…)." };
  }
  let url = cat.baseUrl ?? "";
  if (propia) {
    const v = validarBaseUrl(propia, { produccion: esProduccion() });
    if (!v.ok) return { ok: false, estado: "sin_permiso", mensaje: v.motivo };
    url = v.url;
  }
  return {
    ok: true,
    conexion: {
      proveedor,
      nombre: cat.nombre,
      protocolo: cat.protocolo,
      baseUrl: url.replace(/\/+$/, ""),
      clave,
      urlDelDueno: Boolean(propia),
    },
  };
}

function cabeceras(con: ConexionIa): Record<string, string> {
  if (con.protocolo === "anthropic") {
    return { "Content-Type": "application/json", "x-api-key": con.clave, "anthropic-version": ANTHROPIC_VERSION };
  }
  const h: Record<string, string> = { "Content-Type": "application/json" };
  // Ollama/LM Studio locales no piden clave: se manda solo si hay.
  if (con.clave) h.Authorization = `Bearer ${con.clave}`;
  if (con.proveedor === "openrouter") {
    h["HTTP-Referer"] = "https://buleje.pe";
    h["X-Title"] = "Buleje IA";
  }
  return h;
}

async function pedir(con: ConexionIa, ruta: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const url = `${con.baseUrl}${ruta}`;
  if (con.urlDelDueno && esProduccion()) {
    return safeFetch(url, { ...init, timeoutMs });
  }
  return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export type RespuestaChat = LLMResponse & { estado: EstadoProveedorIa };

function falla(con: ConexionIa, modelo: string, estado: EstadoProveedorIa, detalle?: string): RespuestaChat {
  return {
    ok: false,
    content: null,
    toolCalls: null,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    body: null,
    provider: con.protocolo === "anthropic" ? "anthropic" : "openai",
    model: modelo,
    error: `${estado}: ${detalle ?? mensajeDeEstado(estado, con.nombre)}`,
    estado,
  };
}

/** Un cuerpo SSE con el formato de OpenAI a partir de un texto ya completo. */
function sseDeTexto(texto: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: texto } }] })}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
}

/**
 * Una llamada de chat con herramientas y fotos. `stream: true` devuelve un
 * cuerpo SSE con el formato de OpenAI SIEMPRE (Claude se pide entero y se
 * re-emite así), para que el chat legado lo lea igual.
 */
export async function chatConClave(
  con: ConexionIa,
  opts: LLMCallOptions,
  modelo: string,
  cfg: { timeoutMs?: number } = {},
): Promise<RespuestaChat> {
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_CHAT_MS;
  const hayTools = Boolean(opts.tools && opts.tools.length > 0);
  let res: Response;

  try {
    if (con.protocolo === "anthropic") {
      const { system, messages } = aMensajesAnthropic(opts.messages);
      const body: Record<string, unknown> = { model: modelo, max_tokens: opts.maxTokens ?? 1500, messages };
      if (system) body.system = system;
      if (hayTools) {
        body.tools = aToolsAnthropic(opts.tools ?? []);
        if (opts.toolChoice === "none") body.tool_choice = { type: "none" };
        else if (opts.toolChoice && typeof opts.toolChoice === "object") body.tool_choice = { type: "tool", name: opts.toolChoice.function.name };
      }
      res = await pedir(con, "/messages", { method: "POST", headers: cabeceras(con), body: JSON.stringify(body) }, timeoutMs);
    } else {
      const body: Record<string, unknown> = {
        model: modelo,
        messages: aMensajesOpenAI(opts.messages),
        max_tokens: opts.maxTokens ?? 1500,
        temperature: opts.temperature,
        stream: Boolean(opts.stream),
      };
      if (hayTools) {
        body.tools = opts.tools;
        body.tool_choice = opts.toolChoice ?? "auto";
      }
      res = await pedir(con, "/chat/completions", { method: "POST", headers: cabeceras(con), body: JSON.stringify(body) }, timeoutMs);
    }
  } catch (err) {
    return falla(con, modelo, estadoDeExcepcion(err));
  }

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    const estado = estadoDeHttp(res.status, texto);
    return falla(con, modelo, estado, `HTTP ${res.status} · ${mensajeDeEstado(estado, con.nombre)}`);
  }

  const provider = con.protocolo === "anthropic" ? "anthropic" : "openai";

  if (con.protocolo === "openai" && opts.stream && res.body) {
    return { ok: true, content: null, toolCalls: null, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, body: res.body, provider, model: modelo, estado: "ok" };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return falla(con, modelo, "error", "La respuesta no se pudo leer.");
  }

  let content: string | null = null;
  const toolCalls: ToolCallResult[] = [];
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  if (con.protocolo === "anthropic") {
    const d = data as { content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; usage?: { input_tokens?: number; output_tokens?: number } };
    for (const b of d.content ?? []) {
      if (b.type === "text" && b.text) content = (content ?? "") + b.text;
      else if (b.type === "tool_use") toolCalls.push({ id: b.id ?? "", function: { name: b.name ?? "", arguments: JSON.stringify(b.input ?? {}) } });
    }
    const i = d.usage?.input_tokens ?? 0, o = d.usage?.output_tokens ?? 0;
    usage = { promptTokens: i, completionTokens: o, totalTokens: i + o };
  } else {
    const d = data as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const msg = d.choices?.[0]?.message;
    content = msg?.content ?? null;
    for (const t of msg?.tool_calls ?? []) {
      toolCalls.push({ id: t.id ?? "", function: { name: t.function?.name ?? "", arguments: t.function?.arguments ?? "{}" } });
    }
    usage = {
      promptTokens: d.usage?.prompt_tokens ?? 0,
      completionTokens: d.usage?.completion_tokens ?? 0,
      totalTokens: d.usage?.total_tokens ?? (d.usage?.prompt_tokens ?? 0) + (d.usage?.completion_tokens ?? 0),
    };
  }

  if (opts.stream) {
    return { ok: true, content: null, toolCalls: null, usage, body: sseDeTexto(content ?? ""), provider, model: modelo, estado: "ok" };
  }
  return { ok: true, content, toolCalls: toolCalls.length > 0 ? toolCalls : null, usage, body: null, provider, model: modelo, data, estado: "ok" };
}

// ── Probar la clave ──────────────────────────────────────────────────────────

/**
 * Lista los modelos que el proveedor tiene HOY (`GET /models`; en Claude,
 * `GET /v1/models`). No gasta crédito y distingue clave mala de sin saldo en
 * la mayoría; el saldo de verdad se ve en la primera llamada real.
 */
export async function listarModelos(con: ConexionIa, cfg: { timeoutMs?: number } = {}): Promise<ResultadoPrueba> {
  const t0 = Date.now();
  let res: Response;
  try {
    const ruta = con.protocolo === "anthropic" ? "/models?limit=100" : "/models";
    res = await pedir(con, ruta, { method: "GET", headers: cabeceras(con) }, cfg.timeoutMs ?? TIMEOUT_PRUEBA_MS);
  } catch (err) {
    const estado = estadoDeExcepcion(err);
    return { ok: false, estado, mensaje: mensajeDeEstado(estado, con.nombre), modelos: [], latenciaMs: Date.now() - t0 };
  }
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    const estado = estadoDeHttp(res.status, texto);
    return { ok: false, estado, mensaje: mensajeDeEstado(estado, con.nombre), modelos: [], latenciaMs: Date.now() - t0 };
  }
  let ids: string[] = [];
  try {
    const data = (await res.json()) as { data?: Array<{ id?: string; name?: string }>; models?: Array<{ id?: string; name?: string }> };
    const lista = data.data ?? data.models ?? [];
    ids = lista.map((m) => String(m.id ?? m.name ?? "").replace(/^models\//, "")).filter(Boolean);
  } catch {
    ids = [];
  }
  const unicos = [...new Set(ids)].sort((a, b) => a.localeCompare(b)).slice(0, 500);
  const modelos = unicos.map((id) => ({ id, vision: modeloLeeFotos(con.proveedor, id) }));
  return {
    ok: true,
    estado: "ok",
    mensaje: modelos.length > 0 ? `La clave funciona: ${modelos.length} modelos disponibles.` : "La clave funciona (el servicio no mandó su lista de modelos: escribe el nombre a mano).",
    modelos,
    latenciaMs: Date.now() - t0,
  };
}
