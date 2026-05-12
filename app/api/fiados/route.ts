import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FiadosDB } from "@/lib/db/fiados.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const CreateFiadoSchema = z.object({
  customerId: z.string().min(1).max(100),
  total: z.number().positive(),
  descripcion: z.string().max(500).optional(),
  fechaVence: z.string().datetime().optional(),
});

// FIX 2026-05-07 (P0 #3): el frontend pasaba `status=pagado` lowercase y
// Prisma rechazaba con "Expected FiadoStatus" → endpoint loggeaba 2 errores
// y devolvía `[]` aparentando OK. Normalizamos a uppercase y validamos
// contra el enum real para fallar rápido con 400 si llega algo inesperado.
const FiadoStatusSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.enum(["ACTIVO", "PAGADO", "VENCIDO", "CANCELADO"]));

const ListFiadosSchema = z.object({
  status: FiadoStatusSchema.optional(),
  customerId: z.string().min(1).max(100).optional(),
  search: z.string().max(200).optional(),
});

/** Resolve a customer by phone (exact) or name (partial match). Returns phone (PK). */
async function resolveCustomerId(tenantId: string, input: string): Promise<string | null> {
  // SECURITY 2026-05-07 (X4): Customer.phone es @unique global → siempre con
  // tenantId scope. Usa CustomersDB para lookup exacto por phone (regla #1).
  const byPhone = await CustomersDB.getByPhone(input, tenantId);
  if (byPhone) return byPhone.phone;

  // Name search no esta en CustomersDB — fallback a query directa scoped.
  // eslint-disable-next-line no-restricted-properties -- legacy: name search no centralizado en CustomersDB; refactor a CustomersDB.searchByName pendiente.
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
    const parsed = ListFiadosSchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      customerId: searchParams.get("customerId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    const { status, customerId, search } = parsed.data;

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
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
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

    // Lookup creditLimit del Customer (puede no existir aun; default 0 = sin tope)
    const customer = await CustomersDB.getByPhone(resolvedPhone, auth.tenantId);
    const creditLimitNum = customer?.creditLimit ?? 0;

    // T4 cleanup (regla #1): scoring crediticio centralizado en FiadosDB.
    // Antes 3 prisma.fiado.count/aggregate inlined en este handler.
    const validation = await FiadosDB.validateForNewFiado(
      auth.tenantId,
      resolvedPhone,
      parsed.data.total,
      creditLimitNum,
    );
    if (validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    // Si el Customer no existe en este tenant, crearlo via CustomersDB.upsert.
    if (!customer) {
      await CustomersDB.upsert(
        {
          phone: resolvedPhone,
          name: `Cliente ${resolvedPhone.slice(-4)}`,
          location: "",
          reference: "",
          locations: [],
          activeLocationId: null,
          loyaltyPoints: 0,
          loyaltyTier: "bronce",
          totalSpent: 0,
          creditBalance: 0,
          creditLimit: 0,
          tags: null,
          notifOrderUpdates: true,
          notifPromotions: true,
          notifRestock: true,
        },
        auth.tenantId,
      );
    }

    const fiado = await FiadosDB.create({
      tenantId: auth.tenantId,
      customerId: resolvedPhone,
      total: parsed.data.total,
      descripcion: parsed.data.descripcion,
      fechaVence: parsed.data.fechaVence ? new Date(parsed.data.fechaVence) : undefined,
    });

    logActivity(
      "Crear", "fiado",
      `Nuevo fiado de S/${parsed.data.total.toFixed(2)} para cliente ${resolvedPhone}`,
      fiado.id, auth.username,
    ).catch((err) => logger.warn("[fiados] activity log failed", { err: String(err) }));

    return NextResponse.json(fiado, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    logger.error("[fiados] POST error", { err: msg, stack });
    return NextResponse.json({ error: `Error al crear fiado: ${msg}` }, { status: 503 });
  }
}
