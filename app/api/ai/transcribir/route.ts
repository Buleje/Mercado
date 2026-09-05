import "server-only";

/**
 * app/api/ai/transcribir/route.ts
 *
 * Subir un audio y recibir el texto.
 *
 * El chat del panel ya dicta con el reconocedor del navegador, pero eso no
 * sirve para un audio que YA existe — el de WhatsApp que mandó el chofer, la
 * nota de voz que grabó el operario en el patio. Este endpoint recibe el
 * archivo y devuelve lo que dice, listo para mandar al asistente.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { transcribirAudio, MAX_AUDIO_BYTES } from "@/lib/ai/transcribir";

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  // STRICT: cada llamada consume cuota del proveedor y sube un archivo.
  const rl = await applyRateLimit(req, "STRICT", "transcribir");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Mandá el audio como multipart/form-data en el campo 'audio'." }, { status: 400 });
  }

  const archivo = form.get("audio");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo de audio." }, { status: 400 });
  }
  // Se corta ANTES de leerlo entero en memoria: un archivo de 200 MB no debería
  // llegar siquiera a convertirse en Blob.
  if (archivo.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "El audio supera los 25 MB." }, { status: 413 });
  }

  const res = await transcribirAudio(archivo, archivo.name || "audio.m4a");
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }
  logger.info("[transcribir] audio del panel", { tenantId: auth.tenantId, usuario: auth.username });
  return NextResponse.json({
    texto: res.transcripcion.texto,
    duracion: res.transcripcion.duracion ?? null,
  });
}
