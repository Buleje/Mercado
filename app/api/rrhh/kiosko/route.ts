import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { KioskoAsistenciaDB } from "@/lib/db/rrhh-kiosko.db";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";
import { nuevoTokenKiosko } from "@/lib/rrhh/kiosko-token.server";
import {
  DIAS_VENCE_POR_DEFECTO,
  SIN_APARATO,
  SIN_ENLACE,
  kioskoAjustesSchema,
  kioskoGenerarSchema,
  resumenKiosko,
  type EnlaceGeneradoDTO,
  type ResumenKioskoDTO,
} from "@/lib/rrhh/kiosko";

/**
 * /api/rrhh/kiosko — el dueño maneja el kiosko de asistencia
 * (`lib/rrhh/kiosko.ts`). Sólo admin y dueño: `requireAdmin` deja pasar al
 * encargado (manager) siempre, así que se vuelve a mirar el rol.
 *
 *   GET    → { activo, enlace } (nunca el hash)
 *   PUT    { activo?, permitirSinFoto? } → enciende o apaga la marcación / la marca sin foto
 *   POST   { venceDias? } → enlace nuevo; el token en claro va UNA vez en la respuesta
 *          (el anterior deja de servir y la tablet atada se suelta: se ata la que lo abra)
 *   DELETE → revoca el enlace (y suelta la tablet)
 *
 * Cada escritura pisa sólo sus subclaves (`KioskoAsistenciaDB.guardarConfig`).
 */

const SIN_CACHE = { "Cache-Control": "private, no-store" };

async function dueno(req: NextRequest) {
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  if (!RRHH_COMPLETO.includes(auth.role)) {
    return NextResponse.json({ error: "forbidden", message: "Sólo el dueño o el administrador maneja el kiosko." }, { status: 403 });
  }
  return auth;
}

function registrar(tenantId: string, usuario: string, accion: string, detalle: string): void {
  logActivity(accion, "KioskoAsistencia", detalle, undefined, usuario, undefined, tenantId).catch((err) =>
    logger.warn("[rrhh/kiosko] no se registró la actividad", { tenantId, error: String(err) }),
  );
}

export const GET = withApiHandler("rrhh-kiosko-get", async (req: NextRequest) => {
  const rl = applyRateLimit(req, "GENEROUS", "rrhh-kiosko");
  if (rl) return rl;
  const auth = await dueno(req);
  if (auth instanceof NextResponse) return auth;
  const config = await KioskoAsistenciaDB.config(auth.tenantId);
  return NextResponse.json(resumenKiosko(config, new Date()) satisfies ResumenKioskoDTO, { headers: SIN_CACHE });
});

export const PUT = withApiHandler("rrhh-kiosko-put", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "rrhh-kiosko");
  if (rl) return rl;
  const auth = await dueno(req);
  if (auth instanceof NextResponse) return auth;
  const body = kioskoAjustesSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "validation_error" }, { status: 422 });

  const { activo, permitirSinFoto } = body.data;
  const nueva = await KioskoAsistenciaDB.guardarConfig(auth.tenantId, { activo, permitirSinFoto });
  if (activo !== undefined) {
    registrar(auth.tenantId, auth.username, "rrhh_kiosko_bandera", activo ? "Encendió el kiosko de asistencia" : "Apagó el kiosko de asistencia");
  }
  if (permitirSinFoto !== undefined) {
    registrar(
      auth.tenantId,
      auth.username,
      "rrhh_kiosko_sin_foto",
      permitirSinFoto ? "Permitió marcar sin foto en el kiosko de asistencia" : "Volvió a exigir la foto en el kiosko de asistencia",
    );
  }
  return NextResponse.json(resumenKiosko(nueva, new Date()) satisfies ResumenKioskoDTO, { headers: SIN_CACHE });
});

export const POST = withApiHandler("rrhh-kiosko-post", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "rrhh-kiosko");
  if (rl) return rl;
  const auth = await dueno(req);
  if (auth instanceof NextResponse) return auth;
  const body = kioskoGenerarSchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!body.success) return NextResponse.json({ error: "validation_error" }, { status: 422 });

  const ahora = new Date();
  const dias = body.data.venceDias ?? DIAS_VENCE_POR_DEFECTO;
  const { token, hash, fin } = nuevoTokenKiosko(auth.tenantId);
  const nueva = await KioskoAsistenciaDB.guardarConfig(auth.tenantId, {
    tokenHash: hash,
    tokenFin: fin,
    creadoEn: ahora.toISOString(),
    venceEn: new Date(ahora.getTime() + dias * 86_400_000).toISOString(),
    creadoPor: auth.username,
    ...SIN_APARATO,
  });
  registrar(auth.tenantId, auth.username, "rrhh_kiosko_enlace", `Generó un enlace de kiosko de asistencia (vence en ${dias} días, termina en …${fin})`);
  const res: EnlaceGeneradoDTO = { ...resumenKiosko(nueva, ahora), token };
  return NextResponse.json(res, { headers: SIN_CACHE });
});

export const DELETE = withApiHandler("rrhh-kiosko-delete", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "rrhh-kiosko");
  if (rl) return rl;
  const auth = await dueno(req);
  if (auth instanceof NextResponse) return auth;
  const config = await KioskoAsistenciaDB.config(auth.tenantId);
  const nueva = await KioskoAsistenciaDB.guardarConfig(auth.tenantId, SIN_ENLACE);
  registrar(auth.tenantId, auth.username, "rrhh_kiosko_revocar", `Revocó el enlace del kiosko de asistencia${config.tokenFin ? ` (…${config.tokenFin})` : ""}`);
  return NextResponse.json(resumenKiosko(nueva, new Date()) satisfies ResumenKioskoDTO, { headers: SIN_CACHE });
});
