import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { CamarasDB } from "@/lib/db/camaras.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { ImagenNoPermitida, sharpSeguro, verificarImagen } from "@/lib/camaras/imagen-segura";
import { guardarFotoAsistencia } from "@/lib/rrhh/asistencia-fotos.server";
import type { RespuestaFotoAsistencia } from "@/lib/rrhh/asistencia-fotos";
import { esFechaKey } from "@/lib/rrhh/fechas";
import { RRHH_MARCAR, nivelDeRol, ventanaDeMarcado } from "@/lib/rrhh/roles";

/**
 * POST /api/rrhh/asistencia/foto — respaldo en foto de una marca («Marcar con
 * foto», 2026-10-09). Multipart: `file`, `colaboradorId`, `fecha` AAAA-MM-DD,
 * `camaraId`. Va al Drive en «Cámaras / Asistencia / <fecha>».
 * 200 {ok:true, foto} · 400 datos/imagen · 403 fuera de ventana · 404 colaborador
 * o cámara · 413 · 415 · 502 storage.
 */
const MAX_SIZE = 3 * 1024 * 1024;
const ANCHO_MAX = 1280;

const fotosDeAsistencia = createRateLimiter({ maxRequests: 30, windowMs: 60_000 });

const bodyFotoAsistenciaSchema = z.object({
  colaboradorId: z.string().trim().min(1).max(64),
  camaraId: z.string().trim().min(1).max(64),
  fecha: z.string().refine((v) => esFechaKey(v)),
});

const falla = (error: string, status: number) =>
  NextResponse.json({ ok: false, error } satisfies RespuestaFotoAsistencia, { status });

export const POST = withApiHandler("rrhh-asistencia-foto", async (req: NextRequest) => {
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, fotosDeAsistencia);
  if (rl) return rl;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return falla("forbidden", 403);

  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_SIZE + 64 * 1024) return falla("muy_grande", 413);
  let archivo: File | null = null;
  let campos: Record<string, unknown> = {};
  try {
    const form = await req.formData();
    const f = form.get("file");
    archivo = f instanceof File ? f : null;
    campos = { colaboradorId: form.get("colaboradorId"), camaraId: form.get("camaraId"), fecha: form.get("fecha") };
  } catch {
    archivo = null;
  }
  const body = bodyFotoAsistenciaSchema.safeParse(campos);
  if (!body.success) return falla("datos_invalidos", 400);
  if (!archivo) return falla("sin_imagen", 400);
  if (archivo.size > MAX_SIZE) return falla("muy_grande", 413);

  const ventana = ventanaDeMarcado(nivel, auth.role, limaDateKey());
  if (body.data.fecha > ventana.hasta || (ventana.desde !== null && body.data.fecha < ventana.desde)) {
    return falla("fuera_de_ventana", 403);
  }

  const [colaborador, camaras] = await Promise.all([
    ColaboradoresDB.obtener(auth.tenantId, body.data.colaboradorId),
    CamarasDB.list(auth.tenantId),
  ]);
  if (!colaborador) return falla("colaborador_no_encontrado", 404);
  const camara = camaras.find((c) => c.id === body.data.camaraId);
  if (!camara) return falla("camara_no_encontrada", 404);

  try {
    const bytes = Buffer.from(await archivo.arrayBuffer());
    await verificarImagen(bytes, new Set(["jpeg", "png", "webp"]));
    const imagen = await sharpSeguro(bytes).rotate().resize({ width: ANCHO_MAX, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    const res = await guardarFotoAsistencia(auth.tenantId, {
      colaborador: { id: colaborador.id, nombre: colaborador.nombre },
      fecha: body.data.fecha,
      camara: { id: camara.id, nombre: camara.nombre },
      imagen,
      marcadoPor: auth.username ?? "alguien",
    });
    return NextResponse.json(res, { status: res.ok ? 200 : res.error === "storage" ? 502 : 500 });
  } catch (err) {
    if (err instanceof ImagenNoPermitida) return falla(err.message, 415);
    logger.error("[rrhh.asistencia-foto] falló", { tenantId: auth.tenantId, error: String(err) });
    return falla("no_se_pudo_procesar", 500);
  }
});
