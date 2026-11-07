import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { aColaboradorDTO, aColaboradorMinDTO } from "@/lib/rrhh/dto";
import { RRHH_GESTION, RRHH_MARCAR, nivelDeRol } from "@/lib/rrhh/roles";
import { colaboradorCrearSchema } from "@/lib/rrhh/schemas";
import { ESTADOS_COLABORADOR, type EstadoColaborador, type NivelRrhh } from "@/lib/rrhh/tipos";
import { respuestaErrorColaborador } from "./_errores";

function estadosDeQuery(v: string | null): EstadoColaborador[] | undefined {
  if (!v) return undefined;
  const partes = v.split(",").map((s) => s.trim());
  const validos = partes.filter((s): s is EstadoColaborador => (ESTADOS_COLABORADOR as readonly string[]).includes(s));
  return validos.length > 0 ? validos : undefined;
}

/** GET /api/rrhh/colaboradores — nivel `marcar` sólo con `campos=min`, defense in depth. */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const camposMin = searchParams.get("campos") === "min";
  if (nivel === "marcar" && !camposMin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const rows = await ColaboradoresDB.listar(auth.tenantId, {
      estados: estadosDeQuery(searchParams.get("estado")),
      puestoId: searchParams.get("puestoId") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      incluirCesados: searchParams.get("incluirCesados") === "1",
    });
    const colaboradores = camposMin
      ? rows.map(aColaboradorMinDTO)
      : rows.map((r) => aColaboradorDTO(r, nivel as Exclude<NivelRrhh, "marcar">));
    return NextResponse.json({ nivel, colaboradores }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/colaboradores] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** POST /api/rrhh/colaboradores — alta; `beneficiarioId`/`tarifaInicial` sólo nivel completo. */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = colaboradorCrearSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  if ((parsed.data.beneficiarioId !== undefined || parsed.data.tarifaInicial !== undefined) && nivel !== "completo") {
    return NextResponse.json({ error: "requiere_admin" }, { status: 403 });
  }

  try {
    const row = await ColaboradoresDB.crear(auth.tenantId, parsed.data, auth.username);
    return NextResponse.json({ colaborador: aColaboradorDTO(row, nivel === "completo" ? "completo" : "gestion") }, { status: 201 });
  } catch (e) {
    const mapeado = respuestaErrorColaborador(e);
    if (mapeado) return mapeado;
    logger.error("[rrhh/colaboradores] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
