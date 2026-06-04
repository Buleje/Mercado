import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DiscountRulesDB } from "@/lib/db/discount-rules.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { applyRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit-logger";

// P0 Security (2026-06-04): antes `const TENANT="main"` hardcodeado permitía que
// un admin de otro tenant leyera/creara promos del tenant "main" (fuga + escritura
// cross-tenant). Ahora cada handler usa auth.tenantId — mismo fix que [id]/route.ts.

const DiscountRuleSchema = z.object({
  nombre:      z.string().min(1).max(200),
  tipo:        z.enum(["porcentaje", "2x1", "3x2", "combo", "monto_fijo"]),
  valor:       z.number().min(0).max(100000).default(0),
  categorias:  z.array(z.string()).default([]),
  condicion:   z.string().max(500).optional(),
  fechaInicio: z.string().min(1),
  fechaFin:    z.string().min(1),
  activa:      z.boolean().default(true),
}).superRefine((d, ctx) => {
  // ALTO Security (2026-06-04): sin tope, un descuento "porcentaje" podía
  // crearse en 9999% OFF (abuso de dinero). Cap a 100% para porcentajes.
  if (d.tipo === "porcentaje" && d.valor > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["valor"],
      message: "Un descuento porcentual no puede superar 100%.",
    });
  }
});

function mapRule(r: { id: string; nombre: string; tipo: string; valor: unknown; categorias: string; condicion: string | null; fechaInicio: Date; fechaFin: Date; activa: boolean; tenantId: string; createdAt: Date }) {
  // TD-018: valor es Decimal en DB → serializar a number
  return {
    ...r,
    valor:       toNumOrZero(r.valor as never),
    categorias:  (() => { try { return JSON.parse(r.categorias); } catch { return []; } })(),
    fechaInicio: r.fechaInicio.toISOString().slice(0, 10),
    fechaFin:    r.fechaFin.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const rules = await DiscountRulesDB.list(auth.tenantId);
    return NextResponse.json(rules.map(mapRule));
  } catch (e) {
    logger.error("[discount-rules] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al obtener reglas de descuento" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "discount-rules"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const raw = await req.json();
    const parsed = DiscountRuleSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const d = parsed.data;
    const rule = await DiscountRulesDB.create(auth.tenantId, {
      nombre: d.nombre,
      tipo: d.tipo,
      valor: d.valor,
      categorias: JSON.stringify(d.categorias),
      condicion: d.condicion,
      fechaInicio: new Date(d.fechaInicio),
      fechaFin: new Date(d.fechaFin),
      activa: d.activa,
    });

    // Ley 29733 art. 23-25: registrar creación de promos (rastro de quién/cuándo).
    logAudit({
      req,
      action: "CREATE",
      entity: "Promotion",
      entityId: rule.id,
      detail: `Regla de descuento "${d.nombre}" (${d.tipo} ${d.valor}) creada`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(mapRule(rule), { status: 201 });
  } catch (e) {
    logger.error("[discount-rules] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al crear regla de descuento" }, { status: 500 });
  }
}
