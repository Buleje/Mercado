import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SupplierReturnsDB } from "@/lib/db/supplier-returns.db";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Reporte QA Compras 2026-08-12 — aquí había `const TENANT = "main"` y GET/POST
// lo usaban en vez del tenant de la sesión. Consecuencias medidas en la DB:
//   1. Fuga cross-tenant: la devolución que QA creó desde el tenant forestal
//      (proveedor `sup-1783532813366-xnjo`, tenantId cmpxiv6p4…) quedó guardada
//      con tenantId "main", y cualquier admin de cualquier tenant listaba las
//      devoluciones de "main" como si fueran suyas.
//   2. "Marcar enviada" no hacía nada: el PATCH de `[id]/route.ts` sí filtra por
//      `auth.tenantId`, no encontraba la fila escrita bajo "main" y devolvía 404
//      — que el cliente se tragaba en silencio.
// Regla #3 del proyecto: `tenantId` sale de la sesión, nunca de una constante.

const ItemSchema = z.object({
  nombre:   z.string().min(1).max(200),
  cantidad: z.number().positive(),
  unidad:   z.string().max(20).default("und"),
});

const ReturnSchema = z.object({
  proveedorId:     z.string().optional(),
  proveedorNombre: z.string().min(1).max(200),
  motivo:          z.string().min(1).max(500),
  notas:           z.string().max(1000).optional(),
  items:           z.array(ItemSchema).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const returns = await SupplierReturnsDB.listWithItems(auth.tenantId);
    return NextResponse.json(returns);
  } catch (e) {
    logger.error("[supplier-returns] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al obtener devoluciones" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "supplier-returns"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    // Reporte QA Compras 2026-08-12: crear una OC daba 402 por plan vencido
    // pero registrar una devolución pasaba igual. Las escrituras del módulo se
    // bloquean todas o ninguna (ADR-084); leer sigue permitido.
    const blocked = await requireActiveSubscription(auth.tenantId);
    if (blocked) return blocked;

    const raw = await req.json();
    const parsed = ReturnSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const record = await SupplierReturnsDB.createWithItems(auth.tenantId, parsed.data);
    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    logger.error("[supplier-returns] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al registrar devolución" }, { status: 500 });
  }
}
