import "server-only";
import { logger } from "@/lib/logger";
import {
  AVISO_ASISTENTE_NO_DISPONIBLE,
  AVISO_SIN_CLAVE_ASISTENTE,
  FALLOS_DE_CONFIGURACION,
  type CodigoFalloIA,
} from "@/lib/ai/aviso-clave-ia";
import {
  MODELO_CLAUDE_VISION,
  MODELO_OPENAI_VISION,
  costoDe,
  falloDeRespuesta,
  proveedorVision,
  type ProveedorVision,
  type VisionExtractResult,
} from "@/lib/ai/vision-extract";

/**
 * lib/ai/pregunta-ia.ts — una pregunta en texto a la IA (el asistente del Libro
 * CTP: «¿cuánto shihuahuaco me queda?»). Hermano de `vision-extract.ts`: mismo
 * proveedor (Claude primero, OpenAI de respaldo), misma tabla de precios
 * (`costoDe`) y los fallos del proveedor con las MISMAS palabras
 * (`falloDeRespuesta`). Antes la ruta tenía su propio fetch: OpenAI primero,
 * `claude-sonnet-5` con `thinking: disabled` y un `null` mudo en cada fallo
 * (el operador leía «falta API key o el modelo no respondió» con una clave
 * vencida, sin crédito o con la IA saturada — y nunca se sabía cuál).
 *
 * ## Modelo (skill `claude-api`, 2026-10-02)
 *
 * `claude-sonnet-5-5`: el Sonnet vigente (`shared/models.md`: «sonnet» →
 * `claude-sonnet-5-5`, US$2 / US$10 por millón de tokens). La skill propone
 * Opus 5.5 por defecto para algo nuevo, pero esta ruta ya era del escalón
 * Sonnet y la guía de migración la sube dentro del mismo escalón: responder
 * con un resumen ya armado no gana nada pagando el doble, y el tope del plan
 * gratis es US$0,50 al mes.
 *
 * Lo que exige Sonnet 5.5 (`shared/model-migration.md` → «Migrating to Claude
 * Sonnet 5.5»): `thinking: {type: "disabled"}` es un **400** → sin `thinking`
 * (adaptativo) y `effort: "low"`, que la guía recomienda para chat y en el que
 * el modelo casi nunca razona; lo que razone cuenta dentro de `max_tokens`
 * (de ahí el margen); la respuesta se lee por TIPO de bloque; `stop_reason:
 * "refusal"` se mira antes del texto; y nada de `temperature` (Sonnet 5.5
 * rechaza los parámetros de muestreo que no son los de fábrica).
 */

/** El mismo Sonnet que lee las fotos: un solo modelo vigente para todo el panel. */
export const MODELO_CLAUDE_TEXTO = MODELO_CLAUDE_VISION;

/** Lo que puede razonar el modelo además de la respuesta (en `low` casi nunca; sólo se paga lo usado). */
const MARGEN_RAZONAMIENTO = 1_500;

/** Para reservar ANTES de preguntar: el castellano con cifras da ~3,5 letras por token; 3 queda del lado seguro. */
const LETRAS_POR_TOKEN = 3;

/** Una respuesta corta llega en 2-6 s; más de esto es que la IA no contesta. */
const TIEMPO_MAX_MS = 30_000;

export interface PreguntaIAParams {
  /** Quién es el asistente y qué puede usar (el libro, nunca cifras inventadas). */
  system: string;
  /** Los datos + la pregunta de la persona. */
  pregunta: string;
  /** Tope de la RESPUESTA visible. */
  maxTokens: number;
  /** Prefijo de log (ej. "[ctp.ask]"). */
  logTag: string;
  /** ¿Quien pregunta administra la plataforma? (`veDetalleDeClaveIA`). */
  verDetalleDeClave?: boolean;
}

/** `data` = la respuesta en texto. La misma forma que una lectura: `gastoDeLectura` sirve igual. */
export type PreguntaIAResult = VisionExtractResult<string>;
type Fallo = Extract<PreguntaIAResult, { ok: false }>;

const fallo = (status: number, codigo: CodigoFalloIA, error: string, costoUsd?: number): Fallo =>
  costoUsd == null ? { ok: false, status, codigo, error } : { ok: false, status, codigo, error, costoUsd };

/** Lo que la pantalla necesita saber antes de mostrar el botón: si hay asistente y, sólo con detalle, qué falta. */
export function estadoAsistenteIA(verDetalleDeClave = false): {
  available: boolean;
  aviso: string | null;
  codigo: CodigoFalloIA | null;
} {
  const activo = proveedorVision() != null;
  if (activo) return { available: true, aviso: null, codigo: null };
  return verDetalleDeClave
    ? { available: false, aviso: AVISO_SIN_CLAVE_ASISTENTE, codigo: "sin_lector" }
    : { available: false, aviso: AVISO_ASISTENTE_NO_DISPONIBLE, codigo: "ia_no_disponible" };
}

/** El fallo de «no hay clave», para la ruta que lo revisa antes de reservar gasto. */
export function falloSinAsistente(verDetalleDeClave = false): Fallo {
  return verDetalleDeClave
    ? fallo(503, "sin_lector", AVISO_SIN_CLAVE_ASISTENTE)
    : fallo(503, "ia_no_disponible", AVISO_ASISTENTE_NO_DISPONIBLE);
}

/** El tope de lo que puede costar UNA pregunta con Claude, para reservarlo con `canSpend`. */
export function costoMaximoPreguntaUsd(opts: { system: string; pregunta: string; maxTokens: number }): number {
  const entrada = Math.ceil((opts.system.length + opts.pregunta.length) / LETRAS_POR_TOKEN);
  return costoDe(MODELO_CLAUDE_TEXTO, entrada, opts.maxTokens + MARGEN_RAZONAMIENTO);
}

/** Un fallo de la clave de la plataforma, en la versión que corresponde a quien pregunta. */
function paraQuien(original: Fallo, verDetalleDeClave: boolean): Fallo {
  /* «Carga los datos a mano» es de las lecturas: acá no hay archivo. */
  const f =
    original.codigo === "pedido_rechazado"
      ? { ...original, error: "La IA no aceptó la pregunta. Prueba con otras palabras." }
      : original;
  if (verDetalleDeClave || !f.codigo || !FALLOS_DE_CONFIGURACION.includes(f.codigo)) return f;
  return { ...f, codigo: "ia_no_disponible", error: AVISO_ASISTENTE_NO_DISPONIBLE };
}

interface Respuesta {
  texto: string;
  costoUsd: number;
}

async function conClaude(clave: string, p: PreguntaIAParams): Promise<Respuesta | Fallo> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    body: JSON.stringify({
      model: MODELO_CLAUDE_TEXTO,
      max_tokens: p.maxTokens + MARGEN_RAZONAMIENTO,
      /* Sin `thinking` (adaptativo) y effort `low`: `disabled` es un 400 en Sonnet 5.5. */
      output_config: { effort: "low" },
      system: p.system,
      messages: [{ role: "user", content: p.pregunta }],
    }),
  });
  if (!res.ok) return falloDeRespuesta("claude", res, p.logTag);
  const j = (await res.json()) as {
    content?: { type?: string; text?: unknown }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  /* Contestó 200: se cobró, sirva o no la respuesta. */
  const u = j.usage ?? {};
  const entrada = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  const costoUsd = costoDe(MODELO_CLAUDE_TEXTO, entrada, u.output_tokens ?? 0);
  if (j.stop_reason === "refusal") {
    logger.warn(`${p.logTag} la IA no quiso responder`, { costoUsd });
    return fallo(422, "rechazada", "La IA no quiso responder esa pregunta. Prueba con otras palabras.", costoUsd);
  }
  /* Por TIPO: con razonamiento adaptativo el primer bloque puede ser `thinking`. */
  const texto = (j.content ?? [])
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => String(b.text))
    .join("")
    .trim();
  if (j.stop_reason === "max_tokens") {
    logger.warn(`${p.logTag} la respuesta salió cortada por max_tokens`, { maxTokens: p.maxTokens, costoUsd });
    /* Lo que alcanzó a decir sirve, pero se marca: una cifra a medias no puede parecer entera. */
    if (!texto) return fallo(422, "cortada", "La respuesta salió cortada. Haz una pregunta más concreta.", costoUsd);
    return { texto: `${texto} …`, costoUsd };
  }
  return { texto, costoUsd };
}

async function conOpenAI(clave: string, p: PreguntaIAParams): Promise<Respuesta | Fallo> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
    signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    body: JSON.stringify({
      model: MODELO_OPENAI_VISION,
      messages: [
        { role: "system", content: p.system },
        { role: "user", content: p.pregunta },
      ],
      max_tokens: p.maxTokens,
      temperature: 0.2,
    }),
  });
  if (!res.ok) return falloDeRespuesta("openai", res, p.logTag);
  const j = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    texto: String(j.choices?.[0]?.message?.content ?? "").trim(),
    costoUsd: costoDe(MODELO_OPENAI_VISION, j.usage?.prompt_tokens ?? 0, j.usage?.completion_tokens ?? 0),
  };
}

async function preguntar(p: PreguntaIAParams): Promise<PreguntaIAResult> {
  const proveedor: ProveedorVision | null = proveedorVision();
  if (!proveedor) {
    logger.warn(`${p.logTag} sin ANTHROPIC_API_KEY ni OPENAI_API_KEY configuradas`);
    return falloSinAsistente(true);
  }
  let r: Respuesta | Fallo;
  try {
    r =
      proveedor === "claude"
        ? await conClaude(process.env.ANTHROPIC_API_KEY?.trim() ?? "", p)
        : await conOpenAI(process.env.OPENAI_API_KEY?.trim() ?? "", p);
  } catch (error) {
    /* Sin red, DNS o el tope de tiempo. La pregunta no va al log (puede traer nombres). */
    const tiempo = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    logger.error(`${p.logTag} failed`, { proveedor, error: String(error).slice(0, 200) });
    return tiempo
      ? fallo(503, "ia_saturada", "La IA tardó demasiado en responder: intenta de nuevo en un rato.")
      : fallo(503, "sin_conexion", "No se pudo conectar con la IA. Revisa la conexión del servidor e intenta de nuevo.");
  }
  if ("ok" in r) return r;
  if (!r.texto) {
    logger.warn(`${p.logTag} la IA contestó vacío`, { proveedor, costoUsd: r.costoUsd });
    return fallo(422, "ilegible", "La IA no devolvió una respuesta. Intenta de nuevo.", r.costoUsd);
  }
  return { ok: true, data: r.texto, proveedor, costoUsd: r.costoUsd };
}

/**
 * Pregunta en texto. Nunca lanza: el fallo sale con `status`, `codigo` y la
 * frase para la persona (nunca un 401, que el panel leería como sesión
 * vencida), y con `costoUsd` si la IA contestó y cobró.
 */
export async function preguntarIA(p: PreguntaIAParams): Promise<PreguntaIAResult> {
  const r = await preguntar(p);
  return r.ok ? r : paraQuien(r, p.verDetalleDeClave === true);
}
