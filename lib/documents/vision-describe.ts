import "server-only";
import { logger } from "@/lib/logger";
import { fetchGroqWithRetry } from "@/lib/groq-fetch";
import { cleanJSONResponse } from "@/lib/ai-json-parser";
import { promptDeDescripcion, ResultSchema, type ResultadoDescripcion } from "./descripcion-schema";
import {
  configVisionPropia, esModeloInexistente, hayProveedorDeVision, MODELO_VISION,
} from "./modelo-vision";

/**
 * vision-describe — describir una FOTO de documento con el mismo detalle que un
 * PDF.
 *
 * Media bodega llega al drive como foto: la boleta del proveedor sacada con el
 * celular, el certificado colgado en la pared, el contrato firmado y
 * fotografiado. Sin esto esas imágenes son ciegas para el buscador —sólo tienen
 * el nombre "IMG_2034.jpg"—. Acá el modelo la mira, transcribe lo que se lee y
 * devuelve la MISMA estructura que el camino de texto (`descripcion-schema`).
 *
 * Nunca rompe el drive: si no hay con qué mirar, lo dice y el archivo queda como
 * estaba. La diferencia entre "no hay modelo configurado" y "el modelo se cayó"
 * viaja hasta la pantalla, porque una se arregla con una variable de entorno y
 * la otra reintentando.
 */

export type ResultadoVision =
  | { ok: true; datos: ResultadoDescripcion }
  | { ok: false; motivo: "sin_proveedor" | "sin_modelo" | "falla" };

/** La imagen, con las dos formas de entregarla según a quién le preguntemos. */
export interface ImagenParaVision {
  /** URL firmada — sirve cuando el modelo corre en la nube y puede bajarla. */
  url: string;
  mimeType: string;
  /** Bytes — necesarios para un endpoint propio (Ollama local no baja nada). */
  descargar: () => Promise<Buffer | null>;
}

/** Respuesta OpenAI-compatible → el texto del modelo. */
function contenidoDe(data: unknown): string {
  return (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? "";
}

/** Llama a un endpoint OpenAI-compatible propio (OpenAI, Gemini, Ollama…). */
async function pedirAEndpointPropio(
  cfg: { baseUrl: string; apiKey: string; modelo: string },
  imagen: ImagenParaVision,
  prompt: string,
): Promise<{ ok: true; contenido: string } | { ok: false; error: string }> {
  // La imagen va incrustada: un servidor en tu máquina no puede descargar la
  // URL firmada de Supabase, y los proveedores en la nube aceptan data URL.
  const bytes = await imagen.descargar();
  if (!bytes) return { ok: false, error: "no se pudo leer el archivo del storage" };
  const dataUrl = `data:${imagen.mimeType};base64,${bytes.toString("base64")}`;

  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 120_000); // un modelo local tarda
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: cfg.modelo,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });
    const cuerpo = await resp.text();
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${cuerpo.slice(0, 300)}` };
    return { ok: true, contenido: contenidoDe(JSON.parse(cuerpo)) };
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /abort/i.test(detalle) ? "el modelo tardó demasiado (2 min)" : detalle };
  } finally {
    clearTimeout(corte);
  }
}

export async function describirImagenConVision(
  imagen: ImagenParaVision,
  carpetas: string[],
): Promise<ResultadoVision> {
  if (!hayProveedorDeVision()) return { ok: false, motivo: "sin_proveedor" };

  const prompt = promptDeDescripcion({ modo: "vision", carpetas });
  const propia = configVisionPropia();

  let contenido = "";
  if (propia) {
    const r = await pedirAEndpointPropio(propia, imagen, prompt);
    if (!r.ok) {
      logger.warn("documents.vision.fallo", { err: r.error, modelo: propia.modelo, endpoint: propia.baseUrl });
      return { ok: false, motivo: esModeloInexistente(r.error) ? "sin_modelo" : "falla" };
    }
    contenido = r.contenido;
  } else {
    // Vía del proyecto (Gateway / Groq): el modelo baja la imagen de la URL
    // firmada, así que tiene que ser pública.
    if (!imagen.url || !/^https?:\/\//.test(imagen.url)) {
      logger.warn("documents.vision.url_invalida");
      return { ok: false, motivo: "falla" };
    }
    const resp = await fetchGroqWithRetry(
      process.env.GROQ_API_KEY ?? "",
      {
        model: MODELO_VISION,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imagen.url } },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      },
      "doc-vision-describe",
    );
    if (!resp.ok || !resp.data) {
      logger.warn("documents.vision.fallo", { err: resp.error, modelo: MODELO_VISION });
      // "Ese modelo no existe" no se arregla reintentando: hay que configurar
      // otro. Distinguirlo evita que el usuario apriete 40 veces el botón.
      return { ok: false, motivo: esModeloInexistente(resp.error) ? "sin_modelo" : "falla" };
    }
    contenido = contenidoDe(resp.data);
  }

  try {
    // Doble red: el limpiador de markdown del proyecto y, si igual viene con
    // prosa alrededor, el primer objeto JSON del texto.
    const limpio = cleanJSONResponse(contenido);
    const crudo = limpio.trim().startsWith("{") ? limpio : (contenido.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (!crudo) {
      logger.warn("documents.vision.sin_json");
      return { ok: false, motivo: "falla" };
    }
    const parsed = ResultSchema.safeParse(JSON.parse(crudo));
    if (!parsed.success) {
      logger.warn("documents.vision.json_invalido", { issues: parsed.error.issues.length });
      return { ok: false, motivo: "falla" };
    }
    return { ok: true, datos: parsed.data };
  } catch (err) {
    logger.warn("documents.vision.excepcion", { err: err instanceof Error ? err.message : String(err) });
    return { ok: false, motivo: "falla" };
  }
}
