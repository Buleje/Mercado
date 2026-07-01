import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { CacaoDB } from "@/lib/db/cacao.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * /api/admin/cacao — Acopio & Beneficio de Cacao (ADR-128)
 * GET ?view=producers|lotes|stats · POST ?type=producer|lote · PATCH (annul/update)
 * Guard: spec:agricola:cacao-acopio · rate-limit GENEROUS bucket 'cacao'.
 */

const pct = z.coerce.number().min(0).max(100).nullable().optional();
const money = z.coerce.number().min(0).max(9_999_999).nullable().optional();

const producerSchema = z.object({
  codigo: z.string().trim().max(40).nullable().optional(),
  nombre: z.string().trim().min(2).max(160),
  dni: z.string().trim().max(20).nullable().optional(),
  sector: z.string().trim().max(120).nullable().optional(),
  parcelaHa: z.coerce.number().min(0).max(99999).nullable().optional(),
  variedad: z.string().trim().max(40).nullable().optional(),
  certificacion: z.string().trim().max(40).nullable().optional(),
  altitudMsnm: z.coerce.number().int().min(0).max(6000).nullable().optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  observaciones: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["activo", "inactivo"]).optional(),
});

const loteSchema = z.object({
  loteCode: z.string().trim().max(40).nullable().optional(),
  productorId: z.string().trim().max(60).nullable().optional(),
  productorNombre: z.string().trim().max(160).nullable().optional(),
  fecha: z.coerce.date().optional(),
  variedad: z.string().trim().max(40).nullable().optional(),
  tipoGrano: z.enum(["humedo", "seco"]).optional(),
  pesoKg: z.coerce.number().positive().max(9_999_999),
  humedadPct: pct,
  precioPorKg: money,
  premioPorKg: money,
  cutGranos: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  pctBienFermentado: pct,
  pctVioleta: pct,
  pctPizarroso: pct,
  pctMohoso: pct,
  granosPor100g: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  pctCascara: pct,
  pctImpurezas: pct,
  destino: z.string().trim().max(200).nullable().optional(),
  observaciones: z.string().trim().max(1000).nullable().optional(),
});

const beneficioSchema = z.object({
  loteId: z.string().trim().max(60).nullable().optional(),
  loteCode: z.string().trim().max(40).nullable().optional(),
  fermInicio: z.coerce.date().nullable().optional(),
  fermDias: z.coerce.number().int().min(0).max(60).nullable().optional(),
  fermVolteos: z.coerce.number().int().min(0).max(100).nullable().optional(),
  fermTempMaxC: z.coerce.number().min(0).max(80).nullable().optional(),
  tipoFermentador: z.enum(["cajon", "saco", "monton", "tina"]).nullable().optional(),
  secInicio: z.coerce.date().nullable().optional(),
  secDias: z.coerce.number().int().min(0).max(60).nullable().optional(),
  metodoSecado: z.enum(["solar", "tunel", "mecanico"]).nullable().optional(),
  humedadInicial: pct,
  humedadFinal: pct,
  pesoHumedoKg: z.coerce.number().min(0).max(9_999_999).nullable().optional(),
  pesoSecoKg: z.coerce.number().min(0).max(9_999_999).nullable().optional(),
  estado: z.enum(["fermentando", "secando", "terminado"]).optional(),
  observaciones: z.string().trim().max(1000).nullable().optional(),
});

const ventaSchema = z.object({
  fecha: z.coerce.date().optional(),
  compradorNombre: z.string().trim().max(160).nullable().optional(),
  canal: z.enum(["cooperativa", "exportador", "mercado_local", "otro"]).nullable().optional(),
  loteId: z.string().trim().max(60).nullable().optional(),
  loteCode: z.string().trim().max(40).nullable().optional(),
  pesoKg: z.coerce.number().positive().max(9_999_999),
  moneda: z.enum(["PEN", "USD"]).optional(),
  precioPorKg: money,
  tipoCambio: z.coerce.number().min(0).max(100).nullable().optional(),
  esFob: z.boolean().optional(),
  variedad: z.string().trim().max(40).nullable().optional(),
  grado: z.string().trim().max(20).nullable().optional(),
  montoCobrado: money,
  observaciones: z.string().trim().max(1000).nullable().optional(),
});

const ajusteSchema = z.object({
  fecha: z.coerce.date().optional(),
  tipo: z.enum(["merma", "muestra", "perdida", "ajuste_pos", "ajuste_neg"]),
  cantidadKg: z.coerce.number().positive().max(9_999_999),
  variedad: z.string().trim().max(40).nullable().optional(),
  grado: z.string().trim().max(20).nullable().optional(),
  motivo: z.string().trim().min(3).max(200),
  observaciones: z.string().trim().max(1000).nullable().optional(),
});

const fermRegistroSchema = z.object({
  beneficioId: z.string().trim().min(1).max(60),
  dia: z.coerce.number().int().min(1).max(60),
  fecha: z.coerce.date().optional(),
  tempC: z.coerce.number().min(0).max(80).nullable().optional(),
  volteo: z.boolean().optional(),
  phMasa: z.coerce.number().min(0).max(14).nullable().optional(),
  notas: z.string().trim().max(500).nullable().optional(),
});

const configSchema = z.object({
  precioAlertaPenKg: money,
  stockMinimoKg: z.coerce.number().min(0).max(9_999_999).nullable().optional(),
  fermDiasAlerta: z.coerce.number().int().min(1).max(60).nullable().optional(),
  humedadMaxPct: z.coerce.number().min(0).max(100).nullable().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("annul_lote"),
    id: z.string().trim().min(1),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("annul_beneficio"), id: z.string().trim().min(1) }),
  z.object({
    action: z.literal("advance_beneficio"),
    id: z.string().trim().min(1),
    pesoSecoKg: z.coerce.number().min(0).max(9_999_999).nullable().optional(),
    humedadFinal: pct,
    metodoSecado: z.enum(["solar", "tunel", "mecanico"]).nullable().optional(),
  }),
  z.object({
    action: z.literal("annul_venta"),
    id: z.string().trim().min(1),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("pago_venta"),
    id: z.string().trim().min(1),
    montoCobrado: z.coerce.number().min(0).max(99_999_999),
  }),
  z.object({
    action: z.literal("annul_ajuste"),
    id: z.string().trim().min(1),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal("save_config"), config: configSchema }),
  z.object({
    action: z.literal("update_producer"),
    id: z.string().trim().min(1),
    patch: producerSchema.partial(),
  }),
]);

async function guard(req: NextRequest, roles: ("admin" | "almacenero" | "owner")[]) {
  const auth = await requireAdmin(req, roles);
  if (auth instanceof NextResponse) return { res: auth as NextResponse };
  const rl = await applyRateLimit(req, "GENEROUS", "cacao");
  if (rl) return { res: rl };
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:agricola:cacao-acopio");
  if (!ok)
    return {
      res: NextResponse.json(
        {
          error: "specialization_disabled",
          message: "El módulo de Cacao no está habilitado para este tenant.",
        },
        { status: 403 },
      ),
    };
  return { auth };
}

export async function GET(req: NextRequest) {
  const g = await guard(req, ["admin", "almacenero", "owner"]);
  if (g.res) return g.res;
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") ?? "lotes";
  const search = sp.get("search") ?? undefined;
  const id = sp.get("id") ?? undefined;
  try {
    if (view === "producers")
      return NextResponse.json({
        producers: await CacaoDB.listProducers(g.auth.tenantId, {
          search,
          includeInactive: sp.get("all") === "1",
        }),
      });
    if (view === "producers-stats")
      return NextResponse.json(
        await CacaoDB.producersWithStats(g.auth.tenantId, {
          search,
          includeInactive: sp.get("all") === "1",
        }),
      );
    if (view === "producer-detail") {
      if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
      const detail = await CacaoDB.producerDetail(g.auth.tenantId, id);
      if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json(detail);
    }
    if (view === "lote-detail") {
      if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
      const detail = await CacaoDB.loteDetail(g.auth.tenantId, id);
      if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json(detail);
    }
    if (view === "stats") return NextResponse.json({ stats: await CacaoDB.stats(g.auth.tenantId) });
    if (view === "inventory")
      return NextResponse.json({ inventory: await CacaoDB.inventory(g.auth.tenantId) });
    if (view === "trends")
      return NextResponse.json({ trends: await CacaoDB.trends(g.auth.tenantId) });
    if (view === "precio-historico")
      return NextResponse.json({ serie: await CacaoDB.precioHistorico(g.auth.tenantId) });
    if (view === "beneficios")
      return NextResponse.json({
        beneficios: await CacaoDB.listBeneficios(g.auth.tenantId, { search }),
      });
    if (view === "ventas")
      return NextResponse.json({ ventas: await CacaoDB.listVentas(g.auth.tenantId, { search }) });
    if (view === "ventas-stats")
      return NextResponse.json({ stats: await CacaoDB.ventasStats(g.auth.tenantId) });
    if (view === "venta-trace") {
      if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
      const trace = await CacaoDB.ventaTrace(g.auth.tenantId, id);
      if (!trace) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json(trace);
    }
    if (view === "lotes-disponibles")
      return NextResponse.json({
        lotes: await CacaoDB.availableLotesForBeneficio(g.auth.tenantId),
      });
    if (view === "ajustes")
      return NextResponse.json({ ajustes: await CacaoDB.listAjustes(g.auth.tenantId) });
    if (view === "alerts") return NextResponse.json(await CacaoDB.alerts(g.auth.tenantId));
    if (view === "config")
      return NextResponse.json({ config: await CacaoDB.getConfig(g.auth.tenantId) });
    if (view === "ferm-registros") {
      const beneficioId = sp.get("beneficioId");
      if (!beneficioId)
        return NextResponse.json({ error: "beneficioId_required" }, { status: 400 });
      return NextResponse.json({
        registros: await CacaoDB.listFermRegistros(g.auth.tenantId, beneficioId),
      });
    }
    const from = sp.get("from") ? new Date(sp.get("from")!) : undefined;
    const to = sp.get("to") ? new Date(sp.get("to")!) : undefined;
    return NextResponse.json({
      lotes: await CacaoDB.listLotes(g.auth.tenantId, {
        search,
        variedad: sp.get("variedad") || undefined,
        grado: sp.get("grado") || undefined,
        from: from && !isNaN(from.getTime()) ? from : undefined,
        to: to && !isNaN(to.getTime()) ? to : undefined,
        includeAnnulled: sp.get("includeAnnulled") === "1",
      }),
    });
  } catch (err) {
    logger.error("[cacao.GET] failed", { error: String(err), tenantId: g.auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req, ["admin", "almacenero", "owner"]);
  if (g.res) return g.res;
  const type = new URL(req.url).searchParams.get("type") ?? "lote";
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    if (type === "producer") {
      const parsed = producerSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "validation_error", issues: parsed.error.issues },
          { status: 400 },
        );
      const producer = await CacaoDB.createProducer(g.auth.tenantId, {
        ...parsed.data,
        createdBy: g.auth.username ?? "unknown",
      });
      return NextResponse.json({ producer }, { status: 201 });
    }
    if (type === "venta") {
      const parsed = ventaSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "validation_error", issues: parsed.error.issues },
          { status: 400 },
        );
      const venta = await CacaoDB.createVenta(g.auth.tenantId, {
        ...parsed.data,
        createdBy: g.auth.username ?? "unknown",
      });
      return NextResponse.json({ venta }, { status: 201 });
    }
    if (type === "beneficio") {
      const parsed = beneficioSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "validation_error", issues: parsed.error.issues },
          { status: 400 },
        );
      const beneficio = await CacaoDB.createBeneficio(g.auth.tenantId, {
        ...parsed.data,
        createdBy: g.auth.username ?? "unknown",
      });
      return NextResponse.json({ beneficio }, { status: 201 });
    }
    if (type === "ajuste") {
      const parsed = ajusteSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "validation_error", issues: parsed.error.issues },
          { status: 400 },
        );
      const ajuste = await CacaoDB.createAjuste(g.auth.tenantId, {
        ...parsed.data,
        createdBy: g.auth.username ?? "unknown",
      });
      return NextResponse.json({ ajuste }, { status: 201 });
    }
    if (type === "ferm-registro") {
      const parsed = fermRegistroSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "validation_error", issues: parsed.error.issues },
          { status: 400 },
        );
      try {
        const registro = await CacaoDB.addFermRegistro(g.auth.tenantId, {
          ...parsed.data,
          createdBy: g.auth.username ?? "unknown",
        });
        return NextResponse.json({ registro }, { status: 201 });
      } catch (e) {
        if (String(e instanceof Error ? e.message : e) === "beneficio_not_found")
          return NextResponse.json(
            { error: "beneficio_not_found", message: "No se encontró el beneficio." },
            { status: 404 },
          );
        throw e;
      }
    }
    const parsed = loteSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    const lote = await CacaoDB.createLote(g.auth.tenantId, {
      ...parsed.data,
      createdBy: g.auth.username ?? "unknown",
    });
    return NextResponse.json({ lote }, { status: 201 });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const code = (err as { code?: string })?.code;
    if (msg.includes("ventas_no_disponible") || code === "P2021" || /does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          error: "ventas_no_disponible",
          message:
            "El registro de ventas todavía no está disponible (falta aplicar la migración cacao_venta). Reintenta en unos minutos.",
        },
        { status: 503 },
      );
    }
    logger.error("[cacao.POST] failed", { error: msg, tenantId: g.auth.tenantId, type });
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req, ["admin", "owner"]);
  if (g.res) return g.res;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  try {
    if (parsed.data.action === "annul_lote") {
      return NextResponse.json({
        lote: await CacaoDB.annulLote(g.auth.tenantId, parsed.data.id, parsed.data.reason),
      });
    }
    if (parsed.data.action === "annul_beneficio") {
      return NextResponse.json({
        beneficio: await CacaoDB.annulBeneficio(g.auth.tenantId, parsed.data.id),
      });
    }
    if (parsed.data.action === "advance_beneficio") {
      try {
        const beneficio = await CacaoDB.advanceBeneficio(g.auth.tenantId, parsed.data.id, {
          pesoSecoKg: parsed.data.pesoSecoKg,
          humedadFinal: parsed.data.humedadFinal,
          metodoSecado: parsed.data.metodoSecado,
        });
        return NextResponse.json({ beneficio });
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        const known: Record<string, string> = {
          peso_seco_requerido: "Ingresa el peso seco final para cerrar el beneficio.",
          beneficio_ya_terminado: "Este beneficio ya está terminado.",
          beneficio_anulado: "El beneficio está anulado.",
          beneficio_not_found: "No se encontró el beneficio.",
        };
        if (known[msg])
          return NextResponse.json({ error: msg, message: known[msg] }, { status: 400 });
        throw e;
      }
    }
    if (parsed.data.action === "annul_venta") {
      return NextResponse.json({
        venta: await CacaoDB.annulVenta(g.auth.tenantId, parsed.data.id, parsed.data.reason ?? ""),
      });
    }
    if (parsed.data.action === "pago_venta") {
      try {
        return NextResponse.json({
          venta: await CacaoDB.registrarPagoVenta(
            g.auth.tenantId,
            parsed.data.id,
            parsed.data.montoCobrado,
          ),
        });
      } catch (e) {
        if (String(e instanceof Error ? e.message : e) === "venta_not_found")
          return NextResponse.json(
            { error: "venta_not_found", message: "No se encontró la venta." },
            { status: 404 },
          );
        throw e;
      }
    }
    if (parsed.data.action === "annul_ajuste") {
      return NextResponse.json({
        ajuste: await CacaoDB.annulAjuste(
          g.auth.tenantId,
          parsed.data.id,
          parsed.data.reason ?? "",
        ),
      });
    }
    if (parsed.data.action === "save_config") {
      return NextResponse.json({
        config: await CacaoDB.upsertConfig(g.auth.tenantId, {
          ...parsed.data.config,
          updatedBy: g.auth.username ?? null,
        }),
      });
    }
    return NextResponse.json({
      producer: await CacaoDB.updateProducer(g.auth.tenantId, parsed.data.id, parsed.data.patch),
    });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const code = (err as { code?: string })?.code;
    if (msg.includes("ventas_no_disponible") || code === "P2021" || /does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          error: "ventas_no_disponible",
          message:
            "El registro de ventas todavía no está disponible (falta aplicar la migración cacao_venta).",
        },
        { status: 503 },
      );
    }
    logger.error("[cacao.PATCH] failed", { error: msg, tenantId: g.auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
