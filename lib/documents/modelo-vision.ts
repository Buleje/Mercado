/**
 * modelo-vision — quién MIRA las fotos, en un solo lugar y configurable.
 *
 * Por qué configurable y no una constante: el 2026-07-27 la cuenta de Groq dejó
 * de tener `meta-llama/llama-4-scout-17b-16e-instruct` (la API responde 404
 * `model_not_found`) y no quedó NINGÚN modelo multimodal ahí. Eso venía
 * rompiendo el escáner de cámara EN SILENCIO —el archivo se subía igual, sólo
 * que sin nombre, sin categoría y sin vencimiento— porque el error se tragaba
 * como "best-effort". Atar el drive a un modelo de un proveedor fue el error;
 * ahora se elige por variables de entorno y el sistema DICE cuando no puede.
 *
 * Dos caminos:
 *  1. Sin configurar nada → la infra LLM del proyecto (Vercel AI Gateway o Groq
 *     directo, `groq-fetch`), que recibe la URL firmada de la imagen.
 *  2. `DOC_VISION_BASE_URL` → cualquier endpoint OpenAI-compatible: OpenAI,
 *     Gemini (capa compat), OpenRouter, o un **Ollama local** sin costo. Ahí la
 *     imagen viaja INCRUSTADA en base64, porque un servidor en tu máquina no
 *     puede descargar una URL firmada de Supabase.
 */

export const MODELO_VISION = process.env.DOC_VISION_MODEL?.trim() || "meta-llama/llama-4-scout-17b-16e-instruct";

export interface ConfigVisionPropia {
  baseUrl: string;
  apiKey: string;
  modelo: string;
}

/** Endpoint propio configurado, o null para usar la infra del proyecto. */
export function configVisionPropia(): ConfigVisionPropia | null {
  const baseUrl = process.env.DOC_VISION_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    // Se acepta con o sin `/chat/completions` al final: es el error de dedo
    // más común al copiar la URL de la documentación de un proveedor.
    baseUrl: baseUrl.replace(/\/+$/, "").replace(/\/chat\/completions$/, ""),
    // Ollama no pide credencial, pero el header tiene que existir igual.
    apiKey: process.env.DOC_VISION_API_KEY?.trim() || "no-key",
    modelo: MODELO_VISION,
  };
}

/** ¿Hay a quién preguntarle? (endpoint propio, clave de Groq o Gateway). */
export function hayProveedorDeVision(): boolean {
  return !!(
    configVisionPropia() ||
    process.env.GROQ_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN
  );
}

/** El proveedor contestó "ese modelo no existe / no tenés acceso". */
export function esModeloInexistente(error: string | undefined): boolean {
  return !!error && /model_not_found|does not exist|no access|not found|404/i.test(error);
}

/** Lo que hay que hacer, dicho para quien administra la bodega. */
export const AVISO_SIN_VISION =
  `Para leer fotos hace falta un modelo de visión, y el configurado (${MODELO_VISION}) no está disponible en tu cuenta: ` +
  "poné uno vigente en DOC_VISION_MODEL, o apuntá DOC_VISION_BASE_URL a otro proveedor " +
  "(OpenAI, Gemini, OpenRouter o un Ollama local). Probalo con: node scripts/probar-vision.mjs";
