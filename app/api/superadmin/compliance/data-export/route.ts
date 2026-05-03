import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logActivityQueued } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

// ─── POST /api/superadmin/compliance/data-export ──────────────────────────────
//
// Versión superadmin del export Ley 29733 Art. 18-20. Equivalente al endpoint
// /api/compliance/data-export (que requiere admin del tenant), pero accesible
// desde el panel del superadmin para soporte y cumplimiento legal cross-tenant.
//
// Recibe { tenantSlug, dni }. Busca el tenant por slug o id, y luego al cliente
// por documento dentro de ese tenant. Devuelve el export JSON completo.
//
// Cada export queda registrado en el audit log (entity="compliance",
// action="data_export"). Cumplimiento Ley 29733 Art. 18 — derecho a saber
// quién accedió a tus datos.

const Schema = z.object({
  tenantSlug: z.string().min(1).max(100),
  dni: z.string().min(8, "DNI requiere al menos 8 caracteres").max(15),
});

// Rate limit local: 10 exports por hora por superadmin user.
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRate(username: string): boolean {
  const now = Date.now();
  const e = rateMap.get(username);
  if (!e || now > e.resetAt) {
    rateMap.set(username, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (e.count >= RATE_LIMIT) return false;
  e.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  if (!checkRate(auth.username)) {
    return NextResponse.json(
      { error: "Rate limit excedido. Máximo 10 exports/hora por superadmin." },
      { status: 429 },
    );
  }

  const body = await req.json().catch((err: unknown) => {
    logger.warn("[compliance/data-export] body parse failed", { error: String(err) });
    return null;
  });
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { tenantSlug, dni } = parsed.data;

  try {
    // Resolver tenant por slug O id
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ slug: tenantSlug }, { id: tenantSlug }] },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) {
      return NextResponse.json(
        { error: `Tenant '${tenantSlug}' no encontrado` },
        { status: 404 },
      );
    }

    // Buscar cliente por documento (DNI) dentro del tenant
    const customer = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, documento: dni },
    });
    if (!customer) {
      return NextResponse.json(
        { error: `Cliente con documento ${dni} no encontrado en tenant '${tenant.slug}'` },
        { status: 404 },
      );
    }

    // Fetch en paralelo de TODOS los datos personales del cliente
    const [orders, sales, fiados, savedLocations, notifications] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId: tenant.id, customerPhone: customer.phone },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sale.findMany({
        where: { tenantId: tenant.id, customerPhone: customer.phone },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.fiado.findMany({
        where: { tenantId: tenant.id, customerId: customer.phone },
        include: { cuotas: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.savedLocation.findMany({
        where: { customerPhone: customer.phone },
      }),
      prisma.customerNotification.findMany({
        where: { tenantId: tenant.id, customerPhone: customer.phone },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        legalBasis: "Ley 29733 Art. 18-20 — Derecho de acceso",
        requestedBy: `superadmin:${auth.username}`,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        customerDocument: dni,
      },
      personalData: {
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        tipoDocumento: customer.tipoDocumento,
        documento: customer.documento,
        location: customer.location,
        reference: customer.reference,
        departamento: customer.departamento,
        provincia: customer.provincia,
        distrito: customer.distrito,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total,
        items: o.items,
        createdAt: o.createdAt,
      })),
      sales: sales.map((s) => ({
        id: s.id,
        total: s.total,
        items: s.items,
        createdAt: s.createdAt,
      })),
      fiados: fiados.map((f) => ({
        id: f.id,
        total: f.total,
        saldo: f.saldo,
        status: f.status,
        cuotas: f.cuotas,
        createdAt: f.createdAt,
      })),
      savedLocations,
      notificationsCount: notifications.length,
      counts: {
        orders: orders.length,
        sales: sales.length,
        fiados: fiados.length,
        savedLocations: savedLocations.length,
      },
    };

    // Audit log — Ley 29733 obliga a registrar cada acceso a datos personales
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown";
    logActivityQueued(
      "data_export",
      "compliance",
      `SuperAdmin ${auth.username} exportó datos del cliente ${dni} (tenant ${tenant.slug}). IP ${ip}`,
      customer.phone,
      auth.username,
      undefined,
      tenant.id,
    ).catch((err) =>
      logger.error("[compliance/data-export] activity log failed", { error: String(err) }),
    );

    return NextResponse.json(exportData);
  } catch (err) {
    logger.error("[superadmin/compliance/data-export] unexpected error", {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: "Error interno al generar el export" },
      { status: 500 },
    );
  }
}
