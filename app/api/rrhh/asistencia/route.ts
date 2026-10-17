import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { AsistenciaDB, ColaboradorAjenoError } from "@/lib/db/rrhh-asistencia.db";
import { logActivity } from "@/lib/activity-logger";
import { aAsistenciaDTO, aColaboradorMinDTO } from "@/lib/rrhh/dto";
import { esFechaKey, fechaKeyDeDate, rangoDeDias } from "@/lib/rrhh/fechas";
import { RRHH_MARCAR, nivelDeRol, ventanaDeMarcado } from "@/lib/rrhh/roles";
import { revisarMarca, type ContextoColaborador, type MarcaNormalizada } from "@/lib/rrhh/asistencia";
import { guardarMarcasSchema } from "@/lib/rrhh/schemas";
import type { FechaKey, HojaAsistenciaDTO } from "@/lib/rrhh/tipos";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";

const MAX_DIAS_RANGO = 62;

/** GET /api/rrhh/asistencia?desde=&hasta= — la hoja del rango (≤ 62 días; default hoy). */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-asistencia");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const hoy = limaDateKey();
  const { searchParams } = req.nextUrl;
  const desde = searchParams.get("desde") ?? hoy;
  const hasta = searchParams.get("hasta") ?? hoy;
  const dias = rangoDeDias(desde, hasta);
  if (!esFechaKey(desde) || !esFechaKey(hasta) || dias.length === 0 || dias.length > MAX_DIAS_RANGO) {
    return NextResponse.json({ error: "rango_invalido" }, { status: 422 });
  }

  try {
    const { colaboradores, marcas } = await AsistenciaDB.hoja(auth.tenantId, desde, hasta);
    const body: HojaAsistenciaDTO = {
      nivel,
      hoy,
      desde,
      hasta,
      ventana: ventanaDeMarcado(nivel, auth.role, hoy),
      colaboradores: colaboradores.map(aColaboradorMinDTO),
      marcas: marcas.map((m) => aAsistenciaDTO(m)),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/asistencia] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** PUT /api/rrhh/asistencia — lote atómico de hasta 200 marcas; una que falla, no se escribe ninguna. */
export async function PUT(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-asistencia");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = guardarMarcasSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }

  const hoy = limaDateKey();
  const ventana = ventanaDeMarcado(nivel, auth.role, hoy);

  const colaboradorIds = [...new Set(parsed.data.marcas.map((m) => m.colaboradorId))];
  const filas = await Promise.all(colaboradorIds.map((id) => ColaboradoresDB.obtener(auth.tenantId, id)));
  const contextoPorId = new Map<string, ContextoColaborador>(
    colaboradorIds.map((id, i) => {
      const row = filas[i];
      return [
        id,
        row
          ? { fechaIngreso: row.fechaIngreso ? fechaKeyDeDate(row.fechaIngreso) : null, fechaCese: row.fechaCese ? fechaKeyDeDate(row.fechaCese) : null, eliminado: false }
          : { fechaIngreso: null, fechaCese: null, eliminado: true },
      ];
    }),
  );

  const normalizadas: MarcaNormalizada[] = [];
  const errores: { colaboradorId: string; fecha: FechaKey; motivo: string; message: string }[] = [];
  for (const m of parsed.data.marcas) {
    const revision = revisarMarca(m, {
      colaborador: contextoPorId.get(m.colaboradorId)!,
      hoy,
      ventana,
      marcadoPor: auth.username,
      origen: "manual",
    });
    if (revision.ok) normalizadas.push(revision.marca);
    else errores.push({ colaboradorId: m.colaboradorId, fecha: m.fecha, motivo: revision.motivo, message: revision.message });
  }

  if (errores.length > 0) {
    if (errores.every((e) => e.motivo === "fuera_de_ventana")) {
      return NextResponse.json({ error: "fuera_de_ventana" }, { status: 403 });
    }
    return NextResponse.json({ error: "marcas_invalidas", errores }, { status: 422 });
  }

  try {
    const resultado = await AsistenciaDB.guardar(auth.tenantId, normalizadas, {
      usuario: auth.username,
      motivo: parsed.data.motivo,
      origen: "manual",
    });
    const totalEscrito = resultado.guardadas.length + resultado.quitadas;
    if (totalEscrito > 0) {
      logActivity(
        "rrhh_asistencia_corregir",
        "Asistencia",
        `Corrigió ${totalEscrito} marca${totalEscrito === 1 ? "" : "s"} de asistencia`,
        undefined,
        auth.username,
        undefined,
        auth.tenantId,
      ).catch(() => {});
    }
    return NextResponse.json({
      guardadas: resultado.guardadas.map((r) => aAsistenciaDTO(r)),
      quitadas: resultado.quitadas,
      sinCambio: resultado.sinCambio,
    });
  } catch (e) {
    if (e instanceof ColaboradorAjenoError) {
      return NextResponse.json({ error: "colaborador_ajeno", ids: e.ids }, { status: 403 });
    }
    logger.error("[rrhh/asistencia] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
