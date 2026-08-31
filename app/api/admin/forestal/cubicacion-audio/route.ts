import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { isSpecializationEnabled } from "@/lib/specializations";
import { transcribeAudioBuffer } from "@/lib/voice/transcribe";
import { logger } from "@/lib/logger";

/**
 * /api/admin/forestal/cubicacion-audio — transcribe un archivo de audio
 * donde alguien dictó, tabla por tabla, las medidas de piezas de madera
 * aserrada ("dos ocho once, dos ocho diez…") y devuelve el TEXTO transcrito.
 *
 * A propósito NO clasifica nada acá: el parser de números dictados
 * (`mejoresNumeros`/`partirConFijas` en `lib/forestal/cubicacion.ts`) ya es
 * client-safe y es el MISMO que usa el dictado por voz en vivo — duplicarlo
 * server-side sería una segunda fuente de verdad para la misma regla. Este
 * endpoint sólo hace lo que SÍ necesita secreto/red: hablar con Groq Whisper.
 * El cliente convierte el transcript a piezas con `interpretarDictadoAudio`
 * (cubicacion-import.ts) y el operador revisa el preview antes de sumarlas
 * al lote — igual que el import de Excel/foto.
 */

const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20MB — Whisper large-v3 acepta hasta 25MB en Groq

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:herramientas");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "cubicacion-audio");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form", message: "No pude leer el archivo enviado." }, { status: 400 });
  }

  const file = form.get("audio");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "audio_requerido", message: "Subí un archivo de audio." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "audio_vacio", message: "El archivo de audio está vacío." }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio_muy_grande", message: "El audio pesa más de 20MB — probá con un archivo más corto." }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const transcript = await transcribeAudioBuffer(buffer, file.type || "audio/mp4");
    if (!transcript) {
      return NextResponse.json({ error: "sin_voz", message: "No se detectó voz en el audio." }, { status: 422 });
    }
    return NextResponse.json({ transcript });
  } catch (e) {
    logger.error("[cubicacion-audio] transcripción falló", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "transcripcion_fallo", message: "No se pudo transcribir el audio. Probá de nuevo o con otro archivo." }, { status: 502 });
  }
}
