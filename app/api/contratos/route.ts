import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { ContractsDB } from "@/lib/db/contracts.db";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { CONTRACT_TIPOS, CONTRACT_ESTADOS, estadoVisible } from "@/lib/types/contracts";
import type { DbContract } from "@/lib/types/contracts";

// ── Schemas ─────────────────────────────────────────────────────────────────

const CreateContratoSchema = z.object({
  tipo: z.enum(CONTRACT_TIPOS),
  estado: z.enum(CONTRACT_ESTADOS).optional(),
  clienteNombre: z.string().min(1, "Nombre de la contraparte requerido").max(200),
  clienteDoc: z.string().max(20).default(""),
  descripcion: z.string().max(2000).default(""),
  resumen: z.string().max(2000).default(""),
  monto: z.number().nonnegative("El monto debe ser positivo").default(0),
  moneda: z.enum(["PEN", "USD"]).default("PEN"),
  fecha: z.string().min(10, "Fecha requerida"),
  fechaVencimiento: z.string().min(10).nullish(),
  clausulas: z.array(z.string().max(4000)).max(40).default([]),
  contenido: z.string().max(120_000).default(""),
  datos: z.record(z.string(), z.string()).nullish(),
  plantillaId: z.string().max(80).nullish(),
  condiciones: z.string().max(2000).default(""),
  lugarFirma: z.string().max(200).default("Pucallpa"),
  customerId: z.string().max(40).nullish(),
  supplierId: z.string().max(40).nullish(),
  renovadoDeId: z.string().max(40).nullish(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Una fecha `AAAA-MM-DD` se ancla al mediodía UTC para que no se corra un día en Perú. */
export function fechaValida(v: string): Date | null {
  const d = new Date(v.length === 10 ? `${v}T12:00:00.000Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcularKpis(contratos: DbContract[]) {
  let vigentes = 0;
  let porVencer = 0;
  let vencidos = 0;
  let pendientesFirma = 0;
  let montoVigente = 0;

  for (const c of contratos) {
    const visible = estadoVisible(c);
    if (visible === "VIGENTE") vigentes++;
    if (visible === "POR_VENCER") porVencer++;
    if (visible === "VENCIDO") vencidos++;
    if (visible === "PENDIENTE_FIRMA") pendientesFirma++;
    // El monto comprometido cuenta lo que sigue en pie, no lo anulado ni lo vencido.
    if (visible === "VIGENTE" || visible === "POR_VENCER" || visible === "PENDIENTE_FIRMA") {
      montoVigente += c.monto;
    }
  }

  return {
    total: contratos.length,
    vigentes,
    porVencer,
    vencidos,
    pendientesFirma,
    anulados: contratos.filter((c) => c.estado === "ANULADO").length,
    montoVigente,
    montoTotal: contratos.reduce((s, c) => s + c.monto, 0),
  };
}

// ── GET — Listado + KPIs ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = req.nextUrl;
    const contratos = await ContractsDB.list(auth.tenantId, {
      tipo: url.searchParams.get("tipo") ?? undefined,
      estado: url.searchParams.get("estado") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    return NextResponse.json({ contratos, kpis: calcularKpis(contratos) });
  } catch (e) {
    logger.error("[contratos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// ── POST — Crear ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "contratos");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateContratoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const data = parsed.data;

  const inicio = fechaValida(data.fecha);
  if (!inicio) {
    return NextResponse.json({ error: { fecha: ["Fecha inválida"] } }, { status: 400 });
  }
  const vencimiento = data.fechaVencimiento ? fechaValida(data.fechaVencimiento) : null;
  if (data.fechaVencimiento && !vencimiento) {
    return NextResponse.json({ error: { fechaVencimiento: ["Fecha inválida"] } }, { status: 400 });
  }
  if (vencimiento && vencimiento < inicio) {
    return NextResponse.json(
      { error: { fechaVencimiento: ["El vencimiento no puede ser anterior al inicio"] } },
      { status: 400 },
    );
  }

  try {
    const simbolo = data.moneda === "USD" ? "US$" : "S/";
    const contrato = await ContractsDB.create(auth.tenantId, {
      tipo: data.tipo,
      estado: data.estado ?? "VIGENTE",
      clienteNombre: data.clienteNombre,
      clienteDoc: data.clienteDoc,
      customerId: data.customerId ?? null,
      supplierId: data.supplierId ?? null,
      descripcion: data.descripcion,
      resumen: data.resumen,
      monto: data.monto,
      moneda: data.moneda,
      fechaInicio: inicio.toISOString(),
      fechaVencimiento: vencimiento ? vencimiento.toISOString() : null,
      plantillaId: data.plantillaId ?? null,
      contenido: data.contenido,
      datos: data.datos ?? null,
      clausulas: data.clausulas,
      lugarFirma: data.lugarFirma,
      condiciones: data.condiciones,
      renovadoDeId: data.renovadoDeId ?? null,
      creadoPor: auth.username,
    });

    await ContractsDB.addEvent(
      auth.tenantId,
      contrato.id,
      data.renovadoDeId ? "RENOVADO" : "CREADO",
      `Contrato ${contrato.numero} por ${simbolo}${data.monto.toFixed(2)} con ${data.clienteNombre}`,
      auth.username,
    );

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: contrato.id,
      detail: `Contrato ${contrato.numero} creado (${data.tipo}) para ${data.clienteNombre} por ${simbolo}${data.monto.toFixed(2)}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(contrato, { status: 201 });
  } catch (e) {
    logger.error("[contratos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
