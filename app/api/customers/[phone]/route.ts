import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CustomersDB, normalizePhone } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import type { HealthScore } from "@/app/api/customers/health-scores/route";

const CustomerPatchSchema = z.object({
  // Existing fields
  privateNotes: z.string().max(2000).optional(),
  creditDelta: z.number().optional(),
  aiNotes: z.string().max(5000).optional(),
  creditLimit: z.number().min(0).optional(),
  tags: z.string().max(2000).optional().nullable(),
  name: z.string().min(1).max(100).optional(),
  location: z.string().max(500).optional(),
  // New ficha fields
  tipoPersona: z.string().max(20).optional().nullable(),
  tipoDocumento: z.string().max(20).optional().nullable(),
  documento: z.string().max(20).optional().nullable(),
  razonSocial: z.string().max(200).optional().nullable(),
  estado: z.string().max(20).optional().nullable(),
  whatsappSecundario: z.string().max(30).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  departamento: z.string().max(100).optional().nullable(),
  provincia: z.string().max(100).optional().nullable(),
  distrito: z.string().max(100).optional().nullable(),
  direccion: z.string().max(500).optional().nullable(),
  categoria: z.string().max(50).optional().nullable(),
  canal: z.string().max(30).optional().nullable(),
  listaPrecio: z.string().max(30).optional().nullable(),
  vendedorAsignado: z.string().max(100).optional().nullable(),
  diasCredito: z.number().int().min(0).optional(),
  alertasWhatsapp: z.boolean().optional(),
  fechaNacimiento: z.string().max(30).optional().nullable(),
  genero: z.string().max(10).optional().nullable(),
  comoLlego: z.string().max(30).optional().nullable(),
  observaciones: z.string().max(2000).optional().nullable(),
}).partial();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { phone } = await params;
  const normalized = normalizePhone(phone);
  if (!/^\d{6,15}$/.test(normalized)) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  try {
    const customer = await CustomersDB.getByPhone(normalized, auth.tenantId);
    if (!customer) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    // Compute health score based on last order
    let healthScore: HealthScore = "SIN_HISTORIAL";
     
    const lastOrder = await prisma.order.findFirst({
      where: { customerPhone: normalized, tenantId: auth.tenantId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }).catch((err) => { logger.error("[customers GET] lastOrder lookup failed", { error: String(err), phone: normalized }); return null; });
    if (lastOrder) {
      const daysSince = Math.floor((Date.now() - lastOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince <= 30) healthScore = "ACTIVO";
      else if (daysSince <= 90) healthScore = "EN_RIESGO";
      else healthScore = "PERDIDO";
    }

    // Fetch all fields directly from prisma (CustomersDB may not expose them).
    // Usamos customer.phone (valor real almacenado, ya resuelto por getByPhone
    // tolerante) en vez de `normalized` — así matchea filas legacy con prefijo.
     
    const fullCustomer = await prisma.customer.findFirst({
      where: { phone: customer.phone, tenantId: auth.tenantId },
    });

    return NextResponse.json({
      name: customer.name,
      phone: customer.phone,
      location: customer.location,
      reference: customer.reference,
      locations: customer.locations ?? [],
      activeLocationId: customer.activeLocationId ?? null,
      birthday: customer.birthday ?? null,
      healthScore,
      creditLimit: fullCustomer?.creditLimit ?? 0,
      creditBalance: fullCustomer?.creditBalance ?? 0,
      tags: fullCustomer?.tags ?? null,
      // New ficha fields
      tipoPersona: fullCustomer?.tipoPersona ?? null,
      tipoDocumento: fullCustomer?.tipoDocumento ?? null,
      documento: fullCustomer?.documento ?? null,
      razonSocial: fullCustomer?.razonSocial ?? null,
      estado: fullCustomer?.estado ?? null,
      whatsappSecundario: fullCustomer?.whatsappSecundario ?? null,
      email: fullCustomer?.email ?? null,
      departamento: fullCustomer?.departamento ?? null,
      provincia: fullCustomer?.provincia ?? null,
      distrito: fullCustomer?.distrito ?? null,
      direccion: fullCustomer?.direccion ?? null,
      categoria: fullCustomer?.categoria ?? null,
      canal: fullCustomer?.canal ?? null,
      listaPrecio: fullCustomer?.listaPrecio ?? null,
      vendedorAsignado: fullCustomer?.vendedorAsignado ?? null,
      diasCredito: fullCustomer?.diasCredito ?? 0,
      alertasWhatsapp: fullCustomer?.alertasWhatsapp ?? true,
      fechaNacimiento: fullCustomer?.fechaNacimiento ?? null,
      genero: fullCustomer?.genero ?? null,
      comoLlego: fullCustomer?.comoLlego ?? null,
      observaciones: fullCustomer?.observaciones ?? null,
    });
  } catch (e) {
    logger.error("[customers/phone] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id?: string; phone: string }> }
) {
  // SECURITY 2026-05-26 (P2-1): antes requireAdmin(req) sin roles → cualquier
  // rol autenticado podía editar creditLimit/creditBalance/documento/ruc.
  // Restringido a los mismos 3 roles que el GET (admin/cajero/manager).
  const auth = await requireAdmin(req, ["admin", "cajero", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "customers-patch");
  if (rl) return rl;
  // Round 11 M004: audit log de Customer field updates con admin actor + IP.
  return runWithAuditContext(req, auth.username, () => patchCustomer(req, ctx, auth));
}

async function patchCustomer(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
  const { phone } = await params;
  const normalized = normalizePhone(phone);
  try {
    const raw = await req.json();
    const parsed = CustomerPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    if (parsed.data.privateNotes !== undefined) {
      await CustomersDB.updatePrivateNotes(auth.tenantId, normalized, parsed.data.privateNotes);
    }
    if (parsed.data.creditDelta !== undefined && parsed.data.creditDelta !== 0) {
      await CustomersDB.updateCreditBalance(auth.tenantId, normalized, parsed.data.creditDelta);
    }
    if (parsed.data.aiNotes !== undefined) {
      await CustomersDB.updateAiNotes(auth.tenantId, normalized, parsed.data.aiNotes);
    }

    // Build prisma update data for all direct fields
    const prismaUpdate: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) prismaUpdate.name = parsed.data.name;
    if (parsed.data.location !== undefined) prismaUpdate.location = parsed.data.location;
    if (parsed.data.creditLimit !== undefined) prismaUpdate.creditLimit = parsed.data.creditLimit;
    if (parsed.data.tags !== undefined) prismaUpdate.tags = parsed.data.tags;
    // New ficha fields
    if (parsed.data.tipoPersona !== undefined) prismaUpdate.tipoPersona = parsed.data.tipoPersona;
    if (parsed.data.tipoDocumento !== undefined) prismaUpdate.tipoDocumento = parsed.data.tipoDocumento;
    if (parsed.data.documento !== undefined) prismaUpdate.documento = parsed.data.documento;
    if (parsed.data.razonSocial !== undefined) prismaUpdate.razonSocial = parsed.data.razonSocial;
    if (parsed.data.estado !== undefined) prismaUpdate.estado = parsed.data.estado;
    if (parsed.data.whatsappSecundario !== undefined) prismaUpdate.whatsappSecundario = parsed.data.whatsappSecundario;
    if (parsed.data.email !== undefined) prismaUpdate.email = parsed.data.email;
    if (parsed.data.departamento !== undefined) prismaUpdate.departamento = parsed.data.departamento;
    if (parsed.data.provincia !== undefined) prismaUpdate.provincia = parsed.data.provincia;
    if (parsed.data.distrito !== undefined) prismaUpdate.distrito = parsed.data.distrito;
    if (parsed.data.direccion !== undefined) prismaUpdate.direccion = parsed.data.direccion;
    if (parsed.data.categoria !== undefined) prismaUpdate.categoria = parsed.data.categoria;
    if (parsed.data.canal !== undefined) prismaUpdate.canal = parsed.data.canal;
    if (parsed.data.listaPrecio !== undefined) prismaUpdate.listaPrecio = parsed.data.listaPrecio;
    if (parsed.data.vendedorAsignado !== undefined) prismaUpdate.vendedorAsignado = parsed.data.vendedorAsignado;
    if (parsed.data.diasCredito !== undefined) prismaUpdate.diasCredito = parsed.data.diasCredito;
    if (parsed.data.alertasWhatsapp !== undefined) prismaUpdate.alertasWhatsapp = parsed.data.alertasWhatsapp;
    if (parsed.data.fechaNacimiento !== undefined) {
      prismaUpdate.fechaNacimiento = parsed.data.fechaNacimiento ? new Date(parsed.data.fechaNacimiento) : null;
    }
    if (parsed.data.genero !== undefined) prismaUpdate.genero = parsed.data.genero;
    if (parsed.data.comoLlego !== undefined) prismaUpdate.comoLlego = parsed.data.comoLlego;
    if (parsed.data.observaciones !== undefined) prismaUpdate.observaciones = parsed.data.observaciones;

    if (Object.keys(prismaUpdate).length > 0) {
       
      await prisma.customer.updateMany({
        where: { phone: normalized, tenantId: auth.tenantId },
        data: prismaUpdate,
      });
    }
    // Audit log — fire-and-forget
    // SECURITY 2026-05-07 (CRM-SEC F4): Ley 29733 PE — minimización de PII.
    // No loggear VALORES de campos sensibles; solo indicar que fueron tocados.
    const PII_FIELDS = new Set([
      "documento", "dni", "ruc", "direccion", "location",
      "lat", "lng", "birthday", "fechaNacimiento",
      "creditBalance", "creditLimit", "email",
      "whatsappSecundario",
    ]);
    const safeDetail = Object.keys(parsed.data)
      .filter((k) => (parsed.data as Record<string, unknown>)[k] !== undefined)
      .map((k) => (PII_FIELDS.has(k) ? `${k}=[REDACTED]` : `${k}=${String((parsed.data as Record<string, unknown>)[k])}`))
      .join(", ");
     
    prisma.activityLog.create({
      data: { action: "update", entity: "customer", entityId: normalized, detail: `Campos actualizados: ${safeDetail}`, user: auth.username, tenantId: auth.tenantId },
    }).catch((err) => logger.error("[customers PATCH] activityLog failed", { error: String(err) }));
    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[customers PATCH] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "customers-delete");
  if (rl) return rl;
  // Round 11 M004: audit log de Customer DELETE — operación crítica Ley 29733.
  return runWithAuditContext(req, auth.username, () => deleteCustomer(ctx, auth));
}

async function deleteCustomer(
  { params }: { params: Promise<{ phone: string }> },
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
  const { phone } = await params;
  const normalized = normalizePhone(phone);
  if (!/^\d{6,15}$/.test(normalized)) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  try {
    await CustomersDB.delete(auth.tenantId, normalized);
     
    prisma.activityLog.create({
      data: { action: "delete", entity: "customer", entityId: normalized, detail: `Cliente eliminado: ${normalized}`, user: auth.username, tenantId: auth.tenantId },
    }).catch((err) => logger.error("[customers DELETE] activityLog failed", { error: String(err) }));
    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[customers DELETE] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
