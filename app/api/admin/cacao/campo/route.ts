import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { CacaoCampoDB, CACAO_LABOR_TIPOS } from "@/lib/db/cacao-campo.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * /api/admin/cacao/campo — manejo de campo de cacao (migración 304).
 * GET ?view=parcelas|parcela-detail|stats · POST ?type=parcela|labor
 * PATCH (update_parcela | set_labor) · DELETE ?type=parcela|labor&id=…
 * Guard: spec:agricola:cacao-acopio · rate-limit GENEROUS 'cacao'.
 * El almacenero SÍ registra labores; estructura de parcelas = admin/owner.
 */

const parcelaSchema = z.object({
  codigo: z.string().trim().min(1).max(40),
  nombre: z.string().trim().max(120).nullable().optional(),
  areaHa: z.coerce.number().min(0).max(99999).nullable().optional(),
  variedad: z.string().trim().max(40).nullable().optional(),
  anioSiembra: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
  nPlantas: z.coerce.number().int().min(0).max(10_000_000).nullable().optional(),
  gridRow: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  gridCol: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
  observaciones: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["activa", "inactiva"]).optional(),
});

const laborSchema = z.object({
  parcelaId: z.string().trim().min(1).max(60),
  tipo: z.enum(CACAO_LABOR_TIPOS),
  estado: z.enum(["pendiente", "hecho"]).optional(),
  fechaPlan: z.coerce.date().nullable().optional(),
  fechaHecho: z.coerce.date().nullable().optional(),
  responsable: z.string().trim().max(120).nullable().optional(),
  detalle: z.string().trim().max(500).nullable().optional(),
  cantidad: z.coerce.number().min(0).max(9_999_999).nullable().optional(),
  unidad: z.string().trim().max(20).nullable().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update_parcela"), id: z.string().trim().min(1), patch: parcelaSchema.partial() }),
  z.object({
    action: z.literal("set_labor"),
    id: z.string().trim().min(1),
    estado: z.enum(["hecho", "pendiente"]),
    fechaHecho: z.coerce.date().nullable().optional(),
  }),
]);

async function guard(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return { res: auth };
  const rl = await applyRateLimit(req, "GENEROUS", "cacao");
  if (rl) return { res: rl };
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:agricola:cacao-acopio");
  if (!ok)
    return {
      res: NextResponse.json(
        { error: "specialization_disabled", message: "El módulo de Cacao no está habilitado para este tenant." },
        { status: 403 },
      ),
    };
  return { auth };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (g.res) return g.res;
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") ?? "parcelas";
  const id = sp.get("id") ?? undefined;
  try {
    if (view === "stats") return NextResponse.json({ stats: await CacaoCampoDB.stats(g.auth.tenantId) });
    if (view === "parcela-detail") {
      if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
      const detail = await CacaoCampoDB.parcelaDetail(g.auth.tenantId, id);
      if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json(detail);
    }
    return NextResponse.json({
      parcelas: await CacaoCampoDB.listParcelas(g.auth.tenantId, { includeInactive: sp.get("all") === "1" }),
    });
  } catch (err) {
    logger.error("[cacao.campo.GET] failed", { error: String(err), tenantId: g.auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (g.res) return g.res;
  const type = new URL(req.url).searchParams.get("type") ?? "parcela";
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    if (type === "labor") {
      const parsed = laborSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
      try {
        const labor = await CacaoCampoDB.createLabor(g.auth.tenantId, { ...parsed.data, createdBy: g.auth.username ?? null });
        return NextResponse.json({ labor }, { status: 201 });
      } catch (e) {
        if (String(e instanceof Error ? e.message : e) === "parcela_not_found")
          return NextResponse.json({ error: "parcela_not_found", message: "No se encontró la sección." }, { status: 404 });
        throw e;
      }
    }
    // Alta de parcela = estructura → solo admin/owner.
    if (g.auth.role === "almacenero")
      return NextResponse.json({ error: "forbidden", message: "Crear secciones requiere un administrador." }, { status: 403 });
    const parsed = parcelaSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
    try {
      const parcela = await CacaoCampoDB.createParcela(g.auth.tenantId, { ...parsed.data, createdBy: g.auth.username ?? null });
      return NextResponse.json({ parcela }, { status: 201 });
    } catch (e) {
      if (String(e instanceof Error ? e.message : e) === "codigo_duplicado")
        return NextResponse.json({ error: "codigo_duplicado", message: "Ya existe una sección con ese código." }, { status: 409 });
      throw e;
    }
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    logger.error("[cacao.campo.POST] failed", { error: msg, tenantId: g.auth.tenantId, type });
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req);
  if (g.res) return g.res;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  // Editar la estructura de una parcela = admin/owner; marcar labores = todos.
  if (g.auth.role === "almacenero" && parsed.data.action === "update_parcela")
    return NextResponse.json({ error: "forbidden", message: "Editar secciones requiere un administrador." }, { status: 403 });
  try {
    if (parsed.data.action === "update_parcela") {
      try {
        return NextResponse.json({ parcela: await CacaoCampoDB.updateParcela(g.auth.tenantId, parsed.data.id, parsed.data.patch) });
      } catch (e) {
        if (String(e instanceof Error ? e.message : e) === "codigo_duplicado")
          return NextResponse.json({ error: "codigo_duplicado", message: "Ya existe una sección con ese código." }, { status: 409 });
        throw e;
      }
    }
    try {
      return NextResponse.json({
        labor: await CacaoCampoDB.setLaborEstado(g.auth.tenantId, parsed.data.id, parsed.data.estado, parsed.data.fechaHecho ?? null),
      });
    } catch (e) {
      if (String(e instanceof Error ? e.message : e) === "labor_not_found")
        return NextResponse.json({ error: "labor_not_found", message: "No se encontró la labor." }, { status: 404 });
      throw e;
    }
  } catch (err) {
    logger.error("[cacao.campo.PATCH] failed", { error: String(err), tenantId: g.auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if (g.res) return g.res;
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") ?? "parcela";
  const id = sp.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    if (type === "labor") {
      try {
        return NextResponse.json(await CacaoCampoDB.deleteLabor(g.auth.tenantId, id));
      } catch (e) {
        if (String(e instanceof Error ? e.message : e) === "labor_not_found")
          return NextResponse.json({ error: "labor_not_found", message: "No se encontró la labor." }, { status: 404 });
        throw e;
      }
    }
    if (g.auth.role === "almacenero")
      return NextResponse.json({ error: "forbidden", message: "Eliminar secciones requiere un administrador." }, { status: 403 });
    return NextResponse.json(await CacaoCampoDB.deleteParcela(g.auth.tenantId, id));
  } catch (err) {
    logger.error("[cacao.campo.DELETE] failed", { error: String(err), tenantId: g.auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
