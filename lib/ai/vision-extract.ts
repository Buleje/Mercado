import "server-only";
import { z } from "zod";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { safeParseJSON } from "@/lib/ai-json-parser";
import { logger } from "@/lib/logger";
import {
  AVISO_IA_NO_DISPONIBLE,
  AVISO_SIN_CLAVE_IA,
  FALLOS_DE_CONFIGURACION,
  type CodigoFalloIA,
} from "@/lib/ai/aviso-clave-ia";

/**
 * lib/ai/vision-extract.ts — extracción estructurada desde una foto o un PDF
 * (OCR de planillas manuscritas, placas, guías, constancias). Único lugar que
 * arma el fetch a la IA con visión: antes cada ruta OCR repetía el mismo fetch
 * con fallback y JSON Schema a mano.
 *
 * ## Proveedor y modelo (ronda 3 de ADR-459, 2026-10-02)
 *
 * **Claude primero** si hay `ANTHROPIC_API_KEY` (la clave que pone el dueño);
 * si no, OpenAI. Antes era al revés, y con las dos claves la de Claude nunca
 * se usaba.
 *
 * El modelo sale de la skill `claude-api` (`shared/models.md` y
 * `shared/model-migration.md` → «Migrating to Claude Sonnet 5.5»), no de
 * memoria: `claude-sonnet-5-5` es el Sonnet vigente — alias sin fecha, visión
 * de alta resolución (2576 px de lado mayor), PDF y salida estructurada, a
 * US$2 / US$10 por millón de tokens. Haiku 4.5 cuesta la mitad pero ve a 1568
 * px: la letra chica de una constancia se le pierde. Opus 5.5 cuesta el doble
 * sin ganar nada en leer un papel.
 *
 * Dos cambios que ese modelo exige y que el `claude-sonnet-5` de antes no:
 * - `thinking: {type: "disabled"}` da **400** en Sonnet 5.5. La skill manda
 *   probar primero el razonamiento adaptativo con `effort: "low"` (para
 *   extracción, en `low` se saltea el razonamiento casi siempre). Como lo que
 *   razona cuenta dentro de `max_tokens`, se suma un margen.
 * - La respuesta puede empezar con un bloque `thinking`: se lee el bloque
 *   `text` por su TIPO, nunca `content[0]`.
 *
 * El JSON lo garantiza la API (`output_config.format`), no el prompt.
 *
 * ## Errores en palabras
 *
 * Un 401 de la IA (clave mala) no puede viajar como 401 al navegador: el panel
 * lo leería como sesión vencida y sacaría a la persona. Cada fallo del
 * proveedor se traduce a un mensaje y un `codigo` (`aviso-clave-ia.ts`).
 *
 * ## Auditoría de seguridad (2026-10-02)
 *
 * 1. **Lo cobrado se anota aunque la lectura falle.** Si la IA contestó 200 y
 *    la respuesta salió cortada, negada o ilegible, igual se pagó: el fallo
 *    trae `costoUsd` y cada ruta anota con `gastoDeLectura`. Antes un PDF que
 *    pedía «la nota más larga posible» gastaba sin tocar el tope mensual.
 * 2. **Cada ruta dice qué formatos acepta** y el tipo REAL (por los bytes)
 *    tiene que estar en esa lista y coincidir con el declarado: un PDF
 *    disfrazado de JPEG ya no pasa por la placa. Se rechaza antes de llamar.
 * 3. El estado de la clave de la PLATAFORMA (sin crédito, dónde va la clave)
 *    sólo lo ve quien la administra (`verDetalleDeClave`); el admin de un
 *    negocio ve un aviso genérico.
 * 4. El log nunca guarda lo leído (puede traer DNI y titular — Ley 29733):
 *    sólo el largo y el motivo. La clave y la imagen tampoco van al log.
 */

/** Modelo de Claude para leer fotos y PDF (skill `claude-api`, 2026-10-02). */
export const MODELO_CLAUDE_VISION = "claude-sonnet-5-5";
/** El respaldo cuando no está la clave de Claude (también lo usa el asistente de texto, `pregunta-ia.ts`). */
export const MODELO_OPENAI_VISION = "gpt-4o-mini";

/** USD por millón de tokens. Sonnet 5.5: skill `claude-api`; gpt-4o-mini: lista pública de OpenAI. */
const PRECIO_MTOK: Record<string, { entrada: number; salida: number }> = {
  [MODELO_CLAUDE_VISION]: { entrada: 2, salida: 10 },
  [MODELO_OPENAI_VISION]: { entrada: 0.15, salida: 0.6 },
};

/**
 * Lo que puede razonar el modelo además de la respuesta. En `effort: "low"`
 * casi nunca razona, pero si lo hace y no hay lugar, el JSON sale cortado.
 * Sólo se paga lo que se usa.
 */
const MARGEN_RAZONAMIENTO = 2048;

/**
 * Para reservar ANTES de leer. Una foto de alta resolución son hasta ~4 800
 * tokens (skill `claude-api`: 4 784 a 2576 px); una página de PDF va como
 * imagen + texto, así que se cuenta más. Más el prompt.
 */
const TOKENS_POR_IMAGEN = 4_800;
const TOKENS_POR_PAGINA_PDF = 6_000;
const TOKENS_DEL_PROMPT = 1_000;

/** Un PDF de 2-3 páginas tarda ~20 s; más de esto es que la IA no contesta. */
const TIEMPO_MAX_MS = 55_000;

export type MedioLectura = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf";

/** Lo que acepta una ruta que lee fotos (placa, planillas, cubicación). */
export const FORMATOS_IMAGEN: readonly MedioLectura[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Lo que acepta una ruta que también lee documentos (la constancia). */
export const FORMATOS_IMAGEN_Y_PDF: readonly MedioLectura[] = [...FORMATOS_IMAGEN, "application/pdf"];

export type ProveedorVision = "claude" | "openai";

export interface VisionExtractParams<T> {
  /** Data URL (`data:image/...;base64,...` o `data:application/pdf;base64,...`) o base64 crudo. */
  imageBase64: string;
  /**
   * Los tipos que acepta ESTA ruta. El tipo real (por los bytes) tiene que
   * estar acá y coincidir con el declarado; si no, 400 sin llamar a la IA.
   */
  formatos: readonly MedioLectura[];
  /** Instrucción de qué extraer — específica del dominio (GTF, factura, planilla). */
  prompt: string;
  /** Schema Zod para validar/tipar la respuesta ya parseada. */
  schema: z.ZodType<T>;
  /** JSON Schema equivalente — Claude no lee Zod, necesita el `output_config.format`. */
  jsonSchema: Record<string, unknown>;
  /** Tope de tokens de la RESPUESTA. Planillas con muchas filas necesitan más que un dato suelto. */
  maxTokens?: number;
  /** Prefijo de log (ej. "[cubicacion-ocr:trozas]") para poder rastrear cuál ruta falló. */
  logTag: string;
  /**
   * ¿Quien pide administra la plataforma? (`veDetalleDeClaveIA`). Si no, los
   * fallos de la clave salen con el aviso genérico. Por defecto, no.
   */
  verDetalleDeClave?: boolean;
}

export type VisionExtractResult<T> =
  | { ok: true; data: T; proveedor: ProveedorVision; /** Lo que costó, redondeado al centavo HACIA ARRIBA. */ costoUsd: number }
  | {
      ok: false;
      status: number;
      error: string;
      codigo?: CodigoFalloIA;
      raw?: string;
      /** Presente si la IA contestó (y cobró) aunque la lectura no sirva. */
      costoUsd?: number;
    };

type Fallo = Extract<VisionExtractResult<never>, { ok: false }>;

/** Quién lee hoy: Claude si está su clave, si no OpenAI, si no nadie. */
export function proveedorVision(): ProveedorVision | null {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "claude";
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  return null;
}

/**
 * Lo que la pantalla necesita saber ANTES de pedir un archivo: si hay lector y
 * si lee PDF. El proveedor y el aviso con instrucciones, sólo con detalle.
 */
export function estadoLectorIA(verDetalleDeClave = false): {
  activo: boolean;
  proveedor: ProveedorVision | null;
  leePdf: boolean;
  aviso: string | null;
  codigo: CodigoFalloIA | null;
} {
  const proveedor = proveedorVision();
  const activo = proveedor != null;
  return {
    activo,
    proveedor: verDetalleDeClave ? proveedor : null,
    leePdf: proveedor === "claude",
    aviso: activo ? null : verDetalleDeClave ? AVISO_SIN_CLAVE_IA : AVISO_IA_NO_DISPONIBLE,
    codigo: activo ? null : verDetalleDeClave ? "sin_lector" : "ia_no_disponible",
  };
}

const fallo = (status: number, codigo: CodigoFalloIA, error: string, costoUsd?: number): Fallo =>
  costoUsd == null ? { ok: false, status, codigo, error } : { ok: false, status, codigo, error, costoUsd };

/** El fallo de «no hay clave», para las rutas que lo revisan antes de reservar gasto. */
export function falloSinLector(verDetalleDeClave = false): Fallo {
  return verDetalleDeClave
    ? fallo(503, "sin_lector", AVISO_SIN_CLAVE_IA)
    : fallo(503, "ia_no_disponible", AVISO_IA_NO_DISPONIBLE);
}

/** Un fallo de la clave de la plataforma, en la versión que corresponde a quien pide. */
function paraQuien(f: Fallo, verDetalleDeClave: boolean): Fallo {
  if (verDetalleDeClave || !f.codigo || !FALLOS_DE_CONFIGURACION.includes(f.codigo)) return f;
  return { ...f, codigo: "ia_no_disponible", error: AVISO_IA_NO_DISPONIBLE };
}

/**
 * Lo que hay que anotar en el tope mensual después de leer: lo que costó
 * (éxito, o fallo con respuesta cobrada), o lo reservado si la API no informó
 * el uso. `null` = la IA no cobró (no contestó, o se rechazó antes de llamar).
 */
export function gastoDeLectura(r: VisionExtractResult<unknown>, reservadoUsd: number): number | null {
  if (r.costoUsd == null) return null;
  return r.costoUsd > 0 ? r.costoUsd : reservadoUsd;
}

/** El tope de lo que puede costar UNA lectura con Claude, para reservarlo con `canSpend` antes de leer. */
export function costoMaximoLecturaUsd(opts: { maxTokens: number; paginasPdf?: number }): number {
  const paginas = opts.paginasPdf ?? 0;
  const entrada = (paginas > 0 ? paginas * TOKENS_POR_PAGINA_PDF : TOKENS_POR_IMAGEN) + TOKENS_DEL_PROMPT;
  return costoDe(MODELO_CLAUDE_VISION, entrada, opts.maxTokens + MARGEN_RAZONAMIENTO);
}

/** Cuántas páginas trae un PDF en base64, o `null` si no se puede abrir. */
export async function paginasDePdf(base64: string): Promise<number | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(Buffer.from(base64, "base64"), { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

/** El tipo REAL por los primeros bytes (firma del archivo), o `null` si no es ninguno de los que se leen. */
function medioPorBytes(b64: string): MedioLectura | null {
  const b = Buffer.from(b64.slice(0, 24), "base64");
  const txt = b.toString("latin1");
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (txt.startsWith("\x89PNG\r\n\x1a\n")) return "image/png";
  if (txt.startsWith("GIF87a") || txt.startsWith("GIF89a")) return "image/gif";
  if (txt.startsWith("RIFF") && txt.slice(8, 12) === "WEBP") return "image/webp";
  if (txt.startsWith("%PDF-")) return "application/pdf";
  return null;
}

/** Lo que declara el data URL, normalizado. `null` = no declara nada útil (base64 crudo u octet-stream). */
function medioDeclarado(tipo: string | undefined): string | null {
  const t = (tipo ?? "").trim().toLowerCase();
  if (!t || t === "application/octet-stream") return null;
  if (t === "image/jpg" || t === "image/pjpeg") return "image/jpeg";
  return t;
}

/**
 * Separa el data URL y decide el tipo: el REAL (por los bytes) tiene que estar
 * en `formatos` y, si el data URL declara uno, coincidir. Exportado para el test.
 */
export function separarArchivo(
  entrada: string,
  formatos: readonly MedioLectura[],
): { ok: true; medio: MedioLectura; base64: string } | Fallo {
  const m = /^data:([^;,]*)(?:;[^,;]*)*;base64,/i.exec(entrada);
  const base64 = (m ? entrada.slice(m[0].length) : entrada).replace(/\s/g, "");
  const real = base64 ? medioPorBytes(base64) : null;
  const declarado = medioDeclarado(m?.[1]);
  const leePdf = formatos.includes("application/pdf");
  const queSi = leePdf ? "una foto JPG o PNG, o un PDF" : "una foto JPG o PNG";
  if (!real || !formatos.includes(real)) {
    return fallo(400, "formato_no_soportado", `Ese archivo no se puede leer aquí: usa ${queSi}.`);
  }
  if (declarado && declarado !== real) {
    return fallo(400, "formato_no_soportado", `El archivo no es lo que dice ser (dice ${declarado}): usa ${queSi}.`);
  }
  return { ok: true, medio: real, base64 };
}

/**
 * Costo de una llamada con el uso que informó la API, al centavo hacia arriba
 * (el tope mensual cuenta en centavos y `recordSpend` REDONDEA: US$0,004 sería
 * cero). Exportado para el asistente de texto (`pregunta-ia.ts`): una sola
 * tabla de precios.
 */
export function costoDe(modelo: string, entrada: number, salida: number): number {
  const p = PRECIO_MTOK[modelo];
  if (!p) return 0;
  const usd = (Math.max(0, entrada) * p.entrada + Math.max(0, salida) * p.salida) / 1_000_000;
  if (usd <= 0) return 0;
  return Math.ceil(usd * 100 - 1e-9) / 100;
}

/**
 * Un error del proveedor, en palabras para la persona. PURO — exportado para
 * el test. Nunca devuelve 401: el panel lo tomaría como sesión vencida.
 *
 * Tabla de la skill `claude-api` (`shared/error-codes.md`): 401
 * authentication_error, 402 billing_error, 403 permission_error, 404 modelo no
 * disponible, 413 request_too_large, 429 rate_limit_error, 500 api_error, 529
 * overloaded_error. «Credit balance is too low» llega como 400 en cuentas sin
 * saldo: se reconoce por el texto (como lo hace el propio Claude Code).
 *
 * Devuelve el mensaje CON detalle; `paraQuien` lo cambia por el genérico si
 * quien pide no administra la plataforma.
 */
export function falloDelProveedor(
  proveedor: ProveedorVision,
  status: number,
  tipo: string,
  mensaje: string,
): Fallo {
  const consola = proveedor === "claude" ? "console.anthropic.com" : "platform.openai.com";
  const variable = proveedor === "claude" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const t = `${tipo} ${mensaje}`.toLowerCase();
  if (status === 402 || t.includes("billing_error") || t.includes("credit balance") || t.includes("insufficient_quota")) {
    return fallo(503, "sin_credito", `Se acabó el crédito de la clave de IA. Recárgalo en ${consola} (Billing) y vuelve a intentar.`);
  }
  if (status === 401 || t.includes("authentication_error") || t.includes("invalid_api_key") || t.includes("organization has been disabled")) {
    return fallo(503, "clave_invalida", `La clave de IA no es válida. Revisa ${variable} en el archivo .env.local y reinicia el servidor.`);
  }
  if (status === 403) {
    return fallo(503, "sin_permiso", `La clave de IA no tiene permiso para leer con este modelo. Revísala en ${consola}.`);
  }
  if (status === 404) {
    return fallo(503, "modelo_no_disponible", "El modelo de lectura no está disponible para esta clave de IA.");
  }
  if (status === 413) {
    return fallo(413, "archivo_grande", "El archivo es muy grande para la IA: usa una foto más liviana o un PDF de menos páginas.");
  }
  if (status === 429) {
    return fallo(429, "limite_ia", "La IA recibió muchas lecturas seguidas: espera un minuto y vuelve a intentar.");
  }
  if (status >= 500) {
    return fallo(503, "ia_saturada", "La IA está saturada en este momento: intenta de nuevo en unos minutos.");
  }
  return fallo(502, "pedido_rechazado", "La IA no aceptó el pedido. Carga los datos a mano mientras se revisa.");
}

/**
 * Lee el cuerpo de error sin reventar y lo registra SIN la clave ni la imagen.
 * Exportado para el asistente de texto (`pregunta-ia.ts`): los fallos del
 * proveedor se dicen con las mismas palabras en todo el panel.
 */
export async function falloDeRespuesta(proveedor: ProveedorVision, res: Response, logTag: string): Promise<Fallo> {
  const cuerpo = await res.text().catch(() => "");
  let tipo = "";
  let mensaje = "";
  try {
    const j = JSON.parse(cuerpo) as { error?: { type?: unknown; code?: unknown; message?: unknown } };
    tipo = [j.error?.type, j.error?.code].filter((x) => typeof x === "string").join(" ");
    mensaje = typeof j.error?.message === "string" ? j.error.message : "";
  } catch {
    /* Un cuerpo que no es JSON (proxy, HTML): alcanza con el status. */
  }
  logger.warn(`${logTag} la IA respondió ${res.status}`, {
    proveedor,
    tipo: tipo.slice(0, 80),
    mensaje: mensaje.slice(0, 200),
    requestId: res.headers.get("request-id") ?? undefined,
  });
  return falloDelProveedor(proveedor, res.status, tipo, mensaje);
}

interface RespuestaModelo {
  texto: string;
  costoUsd: number;
}

async function leerConClaude(
  clave: string,
  medio: MedioLectura,
  base64: string,
  prompt: string,
  jsonSchema: Record<string, unknown>,
  maxTokens: number,
  logTag: string,
): Promise<RespuestaModelo | Fallo> {
  /* El PDF va como `document` (sin beta); la foto como `image`. */
  const archivo =
    medio === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: medio, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: medio, data: base64 } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    body: JSON.stringify({
      model: MODELO_CLAUDE_VISION,
      max_tokens: maxTokens + MARGEN_RAZONAMIENTO,
      /* Sin `thinking`: Sonnet 5.5 corre adaptativo y `effort: "low"` lo deja
         casi siempre en cero para una extracción. `disabled` es un 400. */
      output_config: { effort: "low", format: { type: "json_schema", schema: jsonSchema } },
      messages: [{ role: "user", content: [archivo, { type: "text", text: prompt }] }],
    }),
  });
  if (!res.ok) return falloDeRespuesta("claude", res, logTag);
  const j = (await res.json()) as {
    content?: { type?: string; text?: unknown }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  /* Contestó 200: se cobró, sirva o no la lectura. El costo va en el fallo también. */
  const u = j.usage ?? {};
  const entrada = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  const costoUsd = costoDe(MODELO_CLAUDE_VISION, entrada, u.output_tokens ?? 0);
  if (j.stop_reason === "refusal") {
    logger.warn(`${logTag} la IA se negó a leer el archivo`, { costoUsd });
    return fallo(422, "rechazada", "La IA no quiso leer este archivo. Carga los datos a mano.", costoUsd);
  }
  if (j.stop_reason === "max_tokens") {
    logger.warn(`${logTag} la respuesta salió cortada por max_tokens`, { maxTokens, costoUsd });
    return fallo(422, "cortada", "La lectura salió cortada: el papel trae más de lo que entra en una lectura. Carga a mano lo que falte.", costoUsd);
  }
  /* Por TIPO: con razonamiento adaptativo el primer bloque puede ser `thinking`. */
  const bloque = (j.content ?? []).find((b) => b?.type === "text" && typeof b.text === "string");
  return { texto: String(bloque?.text ?? ""), costoUsd };
}

async function leerConOpenAI(
  clave: string,
  medio: MedioLectura,
  base64: string,
  prompt: string,
  maxTokens: number,
  logTag: string,
): Promise<RespuestaModelo | Fallo> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
    signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    body: JSON.stringify({
      model: MODELO_OPENAI_VISION,
      messages: [
        {
          role: "system",
          content: "Eres un extractor de datos de fotos/documentos peruanos. Responde SOLO JSON válido sin markdown. Si algo no se puede leer, no lo inventes.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${medio};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: maxTokens,
      // OCR/extracción — determinístico, variación = errores de parsing.
      temperature: AI_TEMPERATURES.extraction,
    }),
  });
  if (!res.ok) return falloDeRespuesta("openai", res, logTag);
  const j = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    texto: String(j.choices?.[0]?.message?.content ?? ""),
    costoUsd: costoDe(MODELO_OPENAI_VISION, j.usage?.prompt_tokens ?? 0, j.usage?.completion_tokens ?? 0),
  };
}

/** Por qué no se pudo interpretar, sin el texto: `JSON.parse` copia un pedazo de lo leído en su mensaje. */
function motivoIlegible(error: string): string {
  if (error === "empty response") return "vacia";
  if (error.startsWith("JSON.parse")) return "json_invalido";
  return "no_cumple_el_schema";
}

async function leer<T>(params: VisionExtractParams<T>): Promise<VisionExtractResult<T>> {
  const { imageBase64, formatos, prompt, schema, jsonSchema, maxTokens = 2000, logTag } = params;

  /* El formato primero: se rechaza sin gastar ni revelar si hay clave. */
  const archivo = separarArchivo(imageBase64, formatos);
  if (!archivo.ok) return archivo;
  const { medio, base64 } = archivo;

  const proveedor = proveedorVision();
  if (!proveedor) {
    logger.warn(`${logTag} sin ANTHROPIC_API_KEY ni OPENAI_API_KEY configuradas`);
    return falloSinLector(true);
  }
  if (medio === "application/pdf" && proveedor !== "claude") {
    return fallo(415, "formato_no_soportado", "Para leer un PDF hace falta la clave de Claude. Mientras tanto, sube una foto del papel.");
  }

  let r: RespuestaModelo | Fallo;
  try {
    r =
      proveedor === "claude"
        ? await leerConClaude(process.env.ANTHROPIC_API_KEY?.trim() ?? "", medio, base64, prompt, jsonSchema, maxTokens, logTag)
        : await leerConOpenAI(process.env.OPENAI_API_KEY?.trim() ?? "", medio, base64, prompt, maxTokens, logTag);
  } catch (error) {
    /* Sin red, DNS o el tope de tiempo: el detalle al log (sin la imagen), a la persona qué hacer. */
    const tiempo = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    logger.error(`${logTag} failed`, { proveedor, error: String(error).slice(0, 200) });
    return tiempo
      ? fallo(503, "ia_saturada", "La IA tardó demasiado en responder: intenta de nuevo en un rato.")
      : fallo(503, "sin_conexion", "No se pudo conectar con la IA. Revisa la conexión del servidor e intenta de nuevo.");
  }
  if ("ok" in r) return r;

  const parsed = safeParseJSON(r.texto, schema);
  if (!parsed.ok) {
    /* Lo leído NO va al log: puede traer DNI y titular (Ley 29733). Sólo el largo y el motivo. */
    logger.warn(`${logTag} no se pudo interpretar la respuesta del modelo`, {
      proveedor,
      largo: r.texto.length,
      motivo: motivoIlegible(parsed.error),
      costoUsd: r.costoUsd,
    });
    return { ok: false, status: 422, codigo: "ilegible", error: "No se pudo interpretar la foto", raw: parsed.raw, costoUsd: r.costoUsd };
  }
  return { ok: true, data: parsed.data, proveedor, costoUsd: r.costoUsd };
}

export async function visionExtractJSON<T>(params: VisionExtractParams<T>): Promise<VisionExtractResult<T>> {
  const r = await leer(params);
  return r.ok ? r : paraQuien(r, params.verDetalleDeClave === true);
}
