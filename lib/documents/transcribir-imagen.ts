import "server-only";
import { configVisionPropia, hayProveedorDeVision, MODELO_VISION } from "./modelo-vision";
import { describirImagenConVision } from "./vision-describe";
import { logger } from "@/lib/logger";

/**
 * transcribir-imagen — lo que DICE una foto o un escaneo, en texto (ADR-372).
 *
 * Para clasificar un papel hace falta **el texto literal**, no una descripción:
 * el clasificador busca «GUÍA DE TRANSPORTE FORESTAL», «F001-…», «RESOLUCIÓN
 * DIRECTORAL». Medido con `minicpm-v` sobre una factura dibujada: el camino de
 * descripción del Drive devolvió 490 caracteres de resumen y la clasificación
 * quedó en «Otro»; pidiendo transcripción, el mismo modelo devuelve las frases
 * que el formato tiene impresas.
 *
 * Por eso acá el prompt es propio y el camino es el del **endpoint propio**
 * (Ollama), que recibe los bytes. Si no hay endpoint propio se cae al camino del
 * Drive (`describirImagenConVision`), que necesita URL firmada y suele no estar
 * disponible sobre bytes recién subidos — y si tampoco, se devuelve `""`.
 *
 * `""` no es un error: significa «no se pudo leer», y en la clasificación eso es
 * «lo etiqueto por el nombre y lo marco para revisar», que es lo honesto.
 */

/** Un papel no necesita más: con el encabezado y el número alcanza y sobra. */
const MAX_TOKENS = 600;
/**
 * Techo de espera.
 *
 * Medido con `minicpm-v` en la máquina de desarrollo: **2 min 29 s** para una
 * página. Un modelo de visión local es lento y el que sube cinco papeles puede
 * esperar; lo que no puede es quedarse colgado para siempre.
 */
const TECHO_MS = 180_000;

const PROMPT_TRANSCRIPCION =
  "Transcribe LITERALMENTE todo el texto que se lee en la imagen, línea por línea, " +
  "respetando números y códigos exactamente como aparecen. No describas la imagen, " +
  "no expliques nada, no traduzcas: sólo el texto.";

/** Respuesta OpenAI-compatible → el texto del modelo. */
const contenidoDe = (data: unknown): string =>
  (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? "";

export async function transcribirImagen(bytes: Buffer, mimeType: string): Promise<string> {
  if (!hayProveedorDeVision()) return "";
  const propia = configVisionPropia();

  if (propia) {
    const corte = AbortSignal.timeout(TECHO_MS);
    try {
      const r = await fetch(`${propia.baseUrl}/chat/completions`, {
        method: "POST",
        signal: corte,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${propia.apiKey}` },
        body: JSON.stringify({
          model: propia.modelo || MODELO_VISION,
          temperature: 0,
          max_tokens: MAX_TOKENS,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT_TRANSCRIPCION },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` },
                },
              ],
            },
          ],
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const texto = contenidoDe(await r.json()).slice(0, 15_000);
      if (texto.trim()) return texto;
      /* Vacío no es un éxito: se sigue por el camino del Drive antes de rendirse. */
      logger.warn("[transcribir-imagen] el modelo propio devolvió vacío", { modelo: propia.modelo });
    } catch (e) {
      logger.warn("[transcribir-imagen] el modelo propio no leyó", {
        err: e instanceof Error ? e.message : String(e),
        modelo: propia.modelo,
      });
    }
  }

  /* Sin endpoint propio queda el camino del Drive. Devuelve una descripción, no
     una transcripción: alcanza para clasificar cuando el modelo nombra el
     documento, y es mejor que no mirar nada. */
  try {
    const r = await describirImagenConVision({ url: "", mimeType, descargar: async () => bytes }, []);
    if (!r.ok) return "";
    const d = r.datos;
    return [d.summary, d.description, ...(d.keyFacts ?? []), ...(d.tags ?? [])]
      .filter(Boolean)
      .join("\n")
      .slice(0, 15_000);
  } catch (e) {
    logger.warn("[transcribir-imagen] falló", { err: String(e), mimeType });
    return "";
  }
}
