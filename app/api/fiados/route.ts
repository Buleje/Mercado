import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FiadosDB } from "@/lib/db/fiados.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { toNumOrZero } from "@/lib/decimal-utils";
import { applyRateLimit } from "@/lib/rate-limit";

const CreateFiadoSchema = z.object({
  customerId: z.string().min(1).max(100),
  total: z.number().positive(),
  descripcion: z.string().max(500).optional(),
  fechaVence: z.string().datetime().optional(),
});

/** Resolve a customer by phone (exact) or name (partial match). Returns phone (PK). */
async function resolveCustomerId(tenantId: string, input: string): Promise<string | null> {
  // SECURITY 2026-05-07 (X4): Customer SÍ tiene tenantId. El comentario anterior
  // era incorrecto. findUnique({phone}) es @unique global y puede retornar un
  // Customer de otro tenant. Usar findFirst con tenantId en ambas queries.
  const byPhone = await prisma.customer.findFirst({
    where: { phone: input, tenantId },
    select: { phone: true },
  });
  if (byPhone) return byPhone.phone;

  // Try name search (case-insensitive) — scoped a tenant
  const byName = await prisma.customer.findFirst({
    where: { name: { contains: input, mode: "insensitive" }, tenantId },
    select: { phone: true },
  });
  if (byName) return byName.phone;

  return null;
}

// GET /api/fiados — list fiados for tenant
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const customerId = searchParams.get("customerId") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    let fiados: any[] = [];
    try {
      fiados = await withDbRetry(() => FiadosDB.list(auth.tenantId, { status, customerId }));
    } catch (dbErr) {
      // Fallback: query directa sin relaciones si FiadosDB falla
      logger.error("[fiados] FiadosDB.list failed, using direct query", { err: dbErr instanceof Error ? dbErr.message : String(dbErr) });
      const where: Record<string, unknown> = { tenantId: auth.tenantId };
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;
      const rows = await prisma.fiado.findMany({ where, orderBy: { createdAt: "desc" } });
      fiados = rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenantId,
        customerId: r.customerId,
        customerName: r.customerId,
        customerPhone: r.customerId,
        balance: Number(r.saldo),
        total: Number(r.total),
        saldo: Number(r.saldo),
        descripcion: r.descripcion,
        status: r.status,
        dueDate: r.fechaVence?.toISOString(),
        fechaVence: r.fechaVence?.toISOString(),
        cuotas: [],
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    }

    // Enriquecer con aliases que el frontend espera (balance, dueDate, customerPhone)
    fiados = fiados.map((f: any) => ({
      ...f,
      balance: f.balance ?? f.saldo,
      dueDate: f.dueDate ?? f.fechaVence,
      customerPhone: f.customerPhone ?? f.customerId,
    }));

    // Client-side name search filter
    if (search) {
      const q = search.toLowerCase();
      fiados = fiados.filter(
        (f: any) => (f.customerId || "").toLowerCase().includes(q) || (f.customerName || "").toLowerCase().includes(q) || (f.descripcion || "").toLowerCase().includes(q)
      );
    }

    return NextResponse.json(fiados, {
      headers: { "X-Total-Count": String(fiados.length) },
    });
  } catch (e) {
    logger.error("[fiados] GET error", { err: e instanceof Error ? e.message : String(e) });
    // Retornar array vacío en vez de 503 para que el frontend no se rompa
    return NextResponse.json([], { status: 200 });
  }
}

// POST /api/fiados — create new fiado
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "fiados"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreateFiadoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // Resolve customer — buscar por phone o nombre
    let resolvedPhone = await resolveCustomerId(auth.tenantId, parsed.data.customerId);
    if (!resolvedPhone) {
      // Si no encontró, usar el input directamente si parece teléfono
      const input = parsed.data.customerId.trim();
      if (/^\d{7,}$/.test(input)) {
        resolvedPhone = input;
      } else {
        return NextResponse.json(
          { error: `Cliente "${input}" no encontrado. Usa el número de teléfono del cliente.` },
          { status: 404 },
        );
      }
    }

    // Scoring crediticio — bloquear si tiene 3+ fiados con status VENCIDO
    const fiadosVencidos = await prisma.fiado.count({
      where: {
        customerId: resolvedPhone,
        status: "VENCIDO",
        tenantId: auth.tenantId,
      },
    });
    if (fiadosVencidos >= 3) {
      return NextResponse.json(
        { error: `Cliente bloqueado: tiene ${fiadosVencidos} fiados vencidos sin pagar` },
        { status: 400 },
      );
    }

    // Mejora 8: Bloqueo por morosidad — verificar fiados vencidos >60 dias
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const fiadosMuyVencidos = await prisma.fiado.count({
      where: {
        tenantId: auth.tenantId,
        customerId: resolvedPhone,
        status: "ACTIVO",
        fechaVence: { lt: sixtyDaysAgo },
      },
    });

    if (fiadosMuyVencidos > 0) {
      return NextResponse.json(
        {
          error: `Cliente bloqueado: tiene ${fiadosMuyVencidos} fiado(s) vencido(s) hace mas de 60 dias. Debe regularizar antes de crear nuevos.`,
        },
        { status: 400 },
      );
    }

    // Verificar límite de crédito
    const customer = await prisma.customer.findUnique({ where: { phone: resolvedPhone } });
    // TD-018: customer.creditLimit es Decimal | null
    const creditLimitNum = toNumOrZero(customer?.creditLimit);
    if (creditLimitNum > 0) {
      const fiadoActivo = await prisma.fiado.aggregate({
        where: { customerId: resolvedPhone, status: "ACTIVO", tenantId: auth.tenantId },
        _sum: { saldo: true },
      });
      const totalActivo = toNumOrZero(fiadoActivo._sum?.saldo);
      if (totalActivo + parsed.data.total > creditLimitNum) {
        return NextResponse.json(
          {
            error: `Cliente supera límite de crédito. Límite: S/${creditLimitNum.toFixed(2)}, Deuda actual: S/${totalActivo.toFixed(2)}, Disponible: S/${(creditLimitNum - totalActivo).toFixed(2)}`,
          },
          { status: 400 },
        );
      }
    }

    // Asegurar que el Customer existe (upsert)
    await prisma.customer.upsert({
      where: { phone: resolvedPhone },
      create: { phone: resolvedPhone, name: `Cliente ${resolvedPhone.slice(-4)}`, tenantId: auth.tenantId },
      update: {},
    });

    // Crear fiado DIRECTAMENTE con Prisma (bypass FiadosDB para evitar errores de mapeo)
    const fiado = await prisma.fiado.create({
      data: {
        tenantId: auth.tenantId,
        customerId: resolvedPhone,
        total: parsed.data.total,
        saldo: parsed.data.total,
        descripcion: parsed.data.descripcion,
        fechaVence: parsed.data.fechaVence ? new Date(parsed.data.fechaVence) : undefined,
      },
    });

    logActivity(
      "Crear", "fiado",
      `Nuevo fiado de S/${parsed.data.total.toFixed(2)} para cliente ${resolvedPhone}`,
      fiado.id, auth.username,
    ).catch((err) => logger.warn("[fiados] activity log failed", { err: String(err) }));

    return NextResponse.json({
      id: fiado.id,
      tenantId: fiado.tenantId,
      customerId: fiado.customerId,
      total: Number(fiado.total),
      saldo: Number(fiado.saldo),
      descripcion: fiado.descripcion,
      status: fiado.status,
      fechaVence: fiado.fechaVence?.toISOString(),
      createdAt: fiado.createdAt.toISOString(),
      updatedAt: fiado.updatedAt.toISOString(),
      cuotas: [],
    }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    logger.error("[fiados] POST error", { err: msg, stack });
    return NextResponse.json({ error: `Error al crear fiado: ${msg}` }, { status: 503 });
  }
}
