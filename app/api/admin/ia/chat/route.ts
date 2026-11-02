import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { processSafeInput } from "@/lib/ai-safety/sanitize";
import { logger } from "@/lib/logger";
import { conversar } from "@/lib/asistente/conversar";
import { guardarFotos, validarFotos } from "@/lib/asistente/fotos-chat";
import { IaConversacionesDB, tituloDesdeTexto, type ExtraMensaje } from "@/lib/db/ia-conversaciones.db";
import { CarpetaAjenaError } from "@/lib/db/documents.db";
import type { Role } from "@/lib/auth/role-permissions";

/**
 * POST /api/admin/ia/chat — un turno del chat de la app «Buleje IA» (ADR-528).
 * multipart: `texto`, `conversacionId?`, `fotos` ×≤4 (jpeg/png/webp, ≤8 MB c/u).
 * → `{ conversacionId, usuario: MensajeApp, asistente: MensajeApp }`.
 */

const TEXTO_MAX = 2000;

const Campos = z.object({
  texto: z.string().max(10_000),
  conversacionId: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest) {
  const limitado = await applyRateLimit(req, "MODERATE", "ia-chat");
  if (limitado) return limitado;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "No pude leer el mensaje." }, { status: 400 });
  }

  const campos = Campos.safeParse({
    texto: String(form.get("texto") ?? ""),
    conversacionId: form.get("conversacionId") ? String(form.get("conversacionId")) : undefined,
  });
  if (!campos.success) {
    return NextResponse.json({ error: "invalid_body", message: "El mensaje no es válido." }, { status: 400 });
  }

  const archivos = form.getAll("fotos").filter((f): f is File => typeof f !== "string" && f.size > 0);
  const validacion = await validarFotos(archivos);
  if (!validacion.ok) {
    return NextResponse.json({ error: "foto_invalida", message: validacion.message }, { status: validacion.status });
  }

  let texto = processSafeInput(campos.data.texto).trim().slice(0, TEXTO_MAX);
  if (!texto && validacion.fotos.length === 0) {
    return NextResponse.json({ error: "invalid_body", message: "Escribe algo o manda una foto." }, { status: 400 });
  }
  if (!texto) texto = "Te mando la foto.";

  // Una conversación existente tiene que ser DE esta persona (si no, 404).
  let conversacionId = campos.data.conversacionId;
  const esNueva = !conversacionId;
  if (conversacionId) {
    if (!(await IaConversacionesDB.existe(auth.tenantId, auth.username, conversacionId))) {
      return NextResponse.json({ error: "not_found", message: "Esa conversación ya no existe." }, { status: 404 });
    }
  } else {
    conversacionId = randomUUID();
  }

  let imagenes;
  try {
    imagenes = await guardarFotos(auth.tenantId, { username: auth.username, role: auth.role }, validacion.fotos);
  } catch (err) {
    if (err instanceof CarpetaAjenaError) {
      return NextResponse.json({ error: "folder_forbidden", message: "Tu usuario no puede guardar fotos en Documentos." }, { status: 403 });
    }
    return NextResponse.json({ error: "foto_no_guardada", message: "No pude guardar la foto. Intenta de nuevo." }, { status: 502 });
  }

  let r;
  try {
    r = await conversar({
      tenantId: auth.tenantId,
      sesionId: `app:${conversacionId}`,
      texto,
      actorRole: auth.role as Role,
      solicitante: auth.username,
      usuarioPanel: auth.username,
      canal: "app",
      imagenes,
    });
  } catch (err) {
    logger.error("[ia-chat] conversar falló", { error: String(err), tenantId: auth.tenantId });
    // Las fotos ya quedaron en Documentos: no se borran (la persona puede reintentar).
    const msg = err instanceof Error && err.message.length < 300 ? err.message : "La IA no pudo contestar. Intenta de nuevo.";
    return NextResponse.json({ error: "ia_fallo", message: msg }, { status: 502 });
  }

  const textoRespuesta =
    r.texto ??
    (r.pendientes.length > 0
      ? "Esto es lo que voy a anotar. ¿Lo confirmo?"
      : r.registradas.length > 0
        ? "Listo, ya lo anoté."
        : "No terminé de entender. Dímelo de otra forma.");

  const extraUsuario: ExtraMensaje | undefined = imagenes.length
    ? { adjuntos: imagenes.map((i) => ({ documentoId: i.documentoId, nombre: i.nombre })) }
    : undefined;
  const extraAsistente: ExtraMensaje = {
    ...(r.pendientes.length ? { pendientes: r.pendientes.map((p) => ({ id: p.id, resumen: p.resumen, tool: p.tool })) } : {}),
    ...(r.registradas.length ? { registradas: r.registradas } : {}),
    ...(r.papeles?.length ? { papeles: r.papeles } : {}),
    ...(r.modelo ? { modelo: r.modelo } : {}),
  };

  try {
    if (esNueva) {
      await IaConversacionesDB.crear(auth.tenantId, auth.username, tituloDesdeTexto(texto), conversacionId);
    }
    const guardados = await IaConversacionesDB.agregarMensajes(auth.tenantId, auth.username, conversacionId!, [
      { role: "user", content: texto, extra: extraUsuario },
      { role: "assistant", content: textoRespuesta, extra: Object.keys(extraAsistente).length ? extraAsistente : undefined },
    ]);
    if (!guardados || guardados.length < 2) {
      return NextResponse.json({ error: "not_found", message: "Esa conversación ya no existe." }, { status: 404 });
    }
    return NextResponse.json({ conversacionId, usuario: guardados[0], asistente: guardados[1] });
  } catch (err) {
    logger.error("[ia-chat] guardar historial falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "historial_fallo", message: "Contestó, pero no pude guardar la conversación." }, { status: 500 });
  }
}
