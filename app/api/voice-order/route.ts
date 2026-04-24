import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";

/**
 * POST /api/voice-order — Transcripcion de audio + parseo de items.
 *
 * Entrada: FormData con campo "audio" (Blob audio/webm o audio/mp4)
 * Salida: { transcription: string, items: [{name, qty, unit}] }
 *
 * MVP: el parseo se hace con Claude text model asumiendo que el cliente
 * ya transcribio. Si el cliente manda transcription directa (campo
 * "transcription" en JSON), salta el paso de audio.
 *
 * Para integrar Whisper real, instalar @ai-sdk/openai y usar
 * experimental_transcribe(). Mientras tanto, el cliente puede usar
 * Web Speech API (SpeechRecognition) que es gratis en Chrome/Edge.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const ItemSchema = z.object({
  name: z.string().min(1).max(80),
  qty: z.number().positive().max(50),
  unit: z.string().max(20).optional(),
});

const ResponseSchema = z.object({
  items: z.array(ItemSchema).max(20),
});

const MOCK_RESPONSE = {
  transcription: "Necesito 2 kilos de arroz y media docena de huevos",
  items: [
    { name: "Arroz Costeño", qty: 2, unit: "kg" },
    { name: "Huevos", qty: 6, unit: "unidades" },
  ],
};

const PARSE_PROMPT = (transcription: string) =>
  `Un cliente de marketplace peruano dicto esta lista de compras por voz:

"${transcription}"

Extrae los items en formato estructurado. Para cada item:
- name: nombre del producto (capitalizado, singular si aplica)
- qty: cantidad numerica (convertir "media docena" a 6, "dos" a 2, etc)
- unit: unidad (kg, g, litros, unidades, paquete, docena, etc)

Reglas:
- Si la cantidad no se especifica, asumi 1 unidad.
- Si dice "media docena" → qty 6 unidades; "una docena" → qty 12.
- Si dice "medio kilo" → qty 0.5 kg; "un cuarto" → qty 0.25.
- Ignora muletillas: "eh", "este", "a ver", "porfa".
- Si no se entiende un item, omitilo.`;

export async function POST(req: NextRequest) {
  // Caso 1: JSON con transcription ya hecha (cliente uso Web Speech API)
  const contentType = req.headers.get("content-type") ?? "";

  let transcription = "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    const schema = z.object({ transcription: z.string().min(1).max(2000) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Falta transcription" }, { status: 400 });
    }
    transcription = parsed.data.transcription;
  } else if (contentType.includes("multipart/form-data")) {
    // Caso 2: FormData con audio (server transcribe con Whisper)
    const form = await req.formData();
    const audioBlob = form.get("audio");
    if (!audioBlob || typeof audioBlob === "string") {
      return NextResponse.json(
        { error: "Campo 'audio' requerido como archivo" },
        { status: 400 },
      );
    }
    // TODO: integrar Whisper cuando @ai-sdk/openai este instalado.
    // Por ahora retorna mock si viene con audio.
    return NextResponse.json({ ...MOCK_RESPONSE, source: "mock-audio" });
  } else {
    return NextResponse.json(
      { error: "Content-Type debe ser application/json o multipart/form-data" },
      { status: 400 },
    );
  }

  // Parseo de items
  const hasAiKey =
    !!process.env.AI_GATEWAY_API_KEY || !!process.env.ANTHROPIC_API_KEY;

  if (!hasAiKey) {
    return NextResponse.json({
      transcription,
      items: MOCK_RESPONSE.items,
      source: "mock-parse",
    });
  }

  try {
    const { object } = await generateObject({
      model: "anthropic/claude-haiku-4-5",
      schema: ResponseSchema,
      prompt: PARSE_PROMPT(transcription),
      temperature: 0.2,
    });
    return NextResponse.json({
      transcription,
      items: object.items,
      source: "ai",
    });
  } catch (err) {
    return NextResponse.json({
      transcription,
      items: MOCK_RESPONSE.items,
      source: "fallback",
      warn: err instanceof Error ? err.message : "AI error",
    });
  }
}
