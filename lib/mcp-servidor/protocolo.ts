/**
 * lib/mcp-servidor/protocolo.ts — Buleje IA (ADR-528), carril 4.
 *
 * JSON-RPC 2.0 + las reglas del transporte Streamable HTTP de MCP, sin estado.
 * Puro (sin base ni red) para probarlo entero con vitest.
 *
 * Spec verificada el 01-11-2026 en modelcontextprotocol.io: la vigente es
 * `2026-07-28` («moderna»: sin `initialize`, cada pedido trae su versión en
 * `params._meta["io.modelcontextprotocol/protocolVersion"]` y en la cabecera
 * `MCP-Protocol-Version`, más `Mcp-Method`/`Mcp-Name`; `server/discover`
 * obligatorio). Las de `2025-03-26` a `2025-11-25` («legadas») abren con
 * `initialize`. ChatGPT, Claude, Gemini y Cursor todavía hablan las legadas, así
 * que el servidor es de las dos eras («dual-era»): decide por cómo abre cada
 * pedido. Nunca emite `Mcp-Session-Id` (sin estado, permitido por las dos).
 */

export const VERSION_MODERNA = "2026-07-28";
export const VERSIONES_MODERNAS: readonly string[] = [VERSION_MODERNA];
/** De la más nueva a la más vieja: `initialize` con una desconocida recibe la primera. */
export const VERSIONES_LEGADAS: readonly string[] = ["2025-11-25", "2025-06-18", "2025-03-26"];
/** Antes de 2025-06-18 no existía la cabecera: sin ella se asume esta (lo permite la spec). */
export const VERSION_SIN_CABECERA = "2025-03-26";

export const META_VERSION = "io.modelcontextprotocol/protocolVersion";

export const CODIGO = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** 2026-07-28: cabeceras que faltan o no coinciden con el cuerpo. */
  HEADER_MISMATCH: -32020,
  /** 2026-07-28: versión que este servidor no habla. */
  UNSUPPORTED_PROTOCOL_VERSION: -32022,
} as const;

export type IdJsonRpc = string | number;

export interface MensajeJsonRpc {
  jsonrpc: "2.0";
  /** Ausente = notificación (no lleva respuesta: 202). */
  id?: IdJsonRpc;
  method: string;
  params?: Record<string, unknown>;
}

export interface ErrorJsonRpc {
  jsonrpc: "2.0";
  id: IdJsonRpc | null;
  error: { code: number; message: string; data?: unknown };
}

export interface RespuestaJsonRpc {
  jsonrpc: "2.0";
  id: IdJsonRpc;
  result: Record<string, unknown>;
}

export function errorJsonRpc(id: IdJsonRpc | null, code: number, message: string, data?: unknown): ErrorJsonRpc {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

export function respuestaJsonRpc(id: IdJsonRpc, result: Record<string, unknown>): RespuestaJsonRpc {
  return { jsonrpc: "2.0", id, result };
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export type Lectura =
  | { ok: true; mensaje: MensajeJsonRpc }
  | { ok: false; status: number; cuerpo: ErrorJsonRpc };

/**
 * Del texto del POST a un mensaje. Un lote (arreglo) se rechaza: lo quitó la
 * 2025-06-18 y ningún cliente actual lo manda. Una respuesta del cliente
 * tampoco: este servidor nunca le pide nada (spec 2026-07-28: «MUST NOT»).
 */
export function leerMensaje(texto: string): Lectura {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, status: 400, cuerpo: errorJsonRpc(null, CODIGO.PARSE_ERROR, "Parse error: el cuerpo no es JSON") };
  }
  if (Array.isArray(crudo)) {
    return { ok: false, status: 400, cuerpo: errorJsonRpc(null, CODIGO.INVALID_REQUEST, "Invalid Request: no se aceptan lotes") };
  }
  if (!esObjeto(crudo) || crudo.jsonrpc !== "2.0" || typeof crudo.method !== "string" || crudo.method === "") {
    const id = esObjeto(crudo) && (typeof crudo.id === "string" || typeof crudo.id === "number") ? crudo.id : null;
    return { ok: false, status: 400, cuerpo: errorJsonRpc(id, CODIGO.INVALID_REQUEST, "Invalid Request") };
  }
  const tieneId = Object.prototype.hasOwnProperty.call(crudo, "id");
  if (tieneId && typeof crudo.id !== "string" && typeof crudo.id !== "number") {
    return { ok: false, status: 400, cuerpo: errorJsonRpc(null, CODIGO.INVALID_REQUEST, "Invalid Request: id debe ser texto o número") };
  }
  if (crudo.params !== undefined && !esObjeto(crudo.params)) {
    const id = tieneId ? (crudo.id as IdJsonRpc) : null;
    return { ok: false, status: 400, cuerpo: errorJsonRpc(id, CODIGO.INVALID_PARAMS, "Invalid params: params debe ser un objeto") };
  }
  const mensaje: MensajeJsonRpc = { jsonrpc: "2.0", method: crudo.method };
  if (tieneId) mensaje.id = crudo.id as IdJsonRpc;
  if (crudo.params !== undefined) mensaje.params = crudo.params as Record<string, unknown>;
  return { ok: true, mensaje };
}

/** Versión moderna declarada en el cuerpo, o `null` si el pedido es de la era legada. */
export function versionDelCuerpo(m: MensajeJsonRpc): string | null {
  const meta = m.params?._meta;
  if (!esObjeto(meta)) return null;
  const v = meta[META_VERSION];
  return typeof v === "string" ? v : null;
}

/** `=?base64?…?=` → texto (spec «Value Encoding»). Valor plano tal cual; sentinel roto = `null`. */
export function decodificarCabecera(valor: string): string | null {
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(valor);
  if (!m) return valor.startsWith("=?base64?") ? null : valor;
  try {
    return Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Reglas de cabecera de la era moderna (spec 2026-07-28, «Server Validation»).
 * `null` = pasa; si no, el error 400 que va tal cual.
 */
export function validarModerno(cabeceras: Headers, m: MensajeJsonRpc, version: string): ErrorJsonRpc | null {
  const id = m.id ?? null;
  if (!VERSIONES_MODERNAS.includes(version)) {
    return errorJsonRpc(id, CODIGO.UNSUPPORTED_PROTOCOL_VERSION, "Unsupported protocol version", {
      supported: [...VERSIONES_MODERNAS, ...VERSIONES_LEGADAS],
      requested: version,
    });
  }
  const cabVersion = cabeceras.get("mcp-protocol-version");
  if (cabVersion === null) return errorJsonRpc(id, CODIGO.HEADER_MISMATCH, "Header mismatch: falta MCP-Protocol-Version");
  if (cabVersion.trim() !== version) {
    return errorJsonRpc(id, CODIGO.HEADER_MISMATCH, `Header mismatch: MCP-Protocol-Version '${cabVersion}' no coincide con el cuerpo`);
  }
  const cabMetodo = cabeceras.get("mcp-method");
  if (cabMetodo === null) return errorJsonRpc(id, CODIGO.HEADER_MISMATCH, "Header mismatch: falta Mcp-Method");
  if (cabMetodo.trim() !== m.method) {
    return errorJsonRpc(id, CODIGO.HEADER_MISMATCH, "Header mismatch: Mcp-Method no coincide con el cuerpo");
  }
  if (m.method === "tools/call") {
    const cabNombre = cabeceras.get("mcp-name");
    if (cabNombre === null) return errorJsonRpc(id, CODIGO.HEADER_MISMATCH, "Header mismatch: falta Mcp-Name");
    const nombre = decodificarCabecera(cabNombre.trim());
    if (nombre === null || nombre !== m.params?.name) {
      return errorJsonRpc(id, CODIGO.HEADER_MISMATCH, "Header mismatch: Mcp-Name no coincide con el cuerpo");
    }
  }
  return null;
}

/**
 * Era legada: la cabecera es opcional (sin ella = 2025-03-26); si viene con una
 * versión que no hablamos, 400 (spec 2025-06-18). `initialize` negocia aparte.
 */
export function validarLegado(cabeceras: Headers, m: MensajeJsonRpc): ErrorJsonRpc | null {
  if (m.method === "initialize") return null;
  const cab = cabeceras.get("mcp-protocol-version");
  if (cab === null) return null;
  if (VERSIONES_LEGADAS.includes(cab.trim())) return null;
  return errorJsonRpc(m.id ?? null, CODIGO.INVALID_REQUEST, "Unsupported protocol version", {
    supported: [...VERSIONES_LEGADAS, ...VERSIONES_MODERNAS],
    requested: cab,
  });
}

/** `initialize`: la pedida si la hablamos; si no, la más nueva legada (el cliente decide si sigue). */
export function negociarVersionLegada(pedida: unknown): string {
  return typeof pedida === "string" && VERSIONES_LEGADAS.includes(pedida) ? pedida : VERSIONES_LEGADAS[0];
}
