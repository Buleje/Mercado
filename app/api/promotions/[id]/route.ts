import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { OrdersDB, CustomersDB } from "@/lib/jsondb";
import { PromotionsDB } from "@/lib/db/promotions.db";
import { requireAdmin } from "@/lib/require-admin";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { callLLM } from "@/lib/llm-router";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

// Patch parcial: mismos campos que el schema de creación, todos opcionales.
const PromotionUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  minPurchase: z.number().nonnegative().optional(),
  imageUrl: z.string().max(500).optional(),
  message: z.string().max(500).optional(),
  targetType: z.string().max(30).optional(),
  targetPhones: z.string().max(2000).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().max(50).optional(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "promotions-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  // ADR-010: router LLM hace la validación de provider disponible.

  const body = await req.json().catch(() => ({}));
  const context = body.context || "";

  const [customers, orders] = await Promise.all([
    CustomersDB.getAll(auth.tenantId),
    OrdersDB.getAll(auth.tenantId),
  ]);

  // Aggregate stats
  const customerStats: Record<string, { name: string; orders: number; spent: number; products: Record<string, number> }> = {};

  for (const order of orders) {
    const phone = order.customer.phone ?? "guest";
    if (!customerStats[phone]) {
      customerStats[phone] = { name: order.customer.name, orders: 0, spent: 0, products: {} };
    }
    customerStats[phone].orders += 1;
    customerStats[phone].spent += order.total;
    for (const item of order.items) {
      customerStats[phone].products[item.name] = (customerStats[phone].products[item.name] || 0) + item.quantity;
    }
  }

  // Global product popularity
  const globalProducts: Record<string, number> = {};
  for (const order of orders) {
    for (const item of order.items) {
      globalProducts[item.name] = (globalProducts[item.name] || 0) + item.quantity;
    }
  }

  const topGlobal = Object.entries(globalProducts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, qty]) => `${name}: ${qty} unidades`);

  const topCustomers = Object.entries(customerStats)
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, 10)
    .map(([phone, s]) => `${s.name} (${phone}): ${s.orders} pedidos, S/${s.spent.toFixed(2)} gastado – favoritos: ${Object.entries(s.products).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, q]) => `${n}(${q})`).join(", ")}`);

  const prompt = `Eres un experto en marketing para una bodega/tienda de abarrotes en Pucallpa, Perú llamada "Buleje".

Genera sugerencias de PROMOCIONES y PUBLICIDAD basadas en los datos de ventas y clientes.

ESTADÃSTICAS GENERALES:
- Total clientes: ${customers.length}
- Total pedidos: ${orders.length}
- Productos más vendidos:
${topGlobal.join("\n")}

TOP 10 CLIENTES:
${topCustomers.join("\n")}

${context ? `CONTEXTO ADICIONAL DEL USUARIO: ${context}` : ""}

Responde en español con formato Markdown. Para cada sugerencia incluye:
1. **Nombre de la promoción**
2. **Tipo**: descuento %, 2x1, combo, envío gratis, etc.
3. **Productos incluidos**
4. **Público objetivo**: todos, top clientes, clientes nuevos, grupo específico
5. **Mensaje sugerido para WhatsApp** (corto, persuasivo, con emojis)
6. **Porcentaje de descuento sugerido**

Genera al menos 5 promociones diferentes clasificadas por tipo de audiencia.`;

  try {
    // ADR-010: router balanced tier. Creative generation con temperatura baja.
    const res = await callLLM("balanced", {
      messages: [{ role: "user", content: prompt }],
      temperature: AI_TEMPERATURES.creative,
      maxTokens: 2000,
      label: "promotions-id",
    });

    if (!res.ok) {
      logger.error("[promotions-id] router error", { err: String(res.error) });
      return NextResponse.json({ error: res.error ?? "Error IA" }, { status: 502 });
    }

    const suggestions = res.content ?? "No se pudieron generar sugerencias.";
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: "Error al conectar con la IA" }, { status: 502 });
  }
}

// ── Editar / activar-desactivar / eliminar una promoción ──────────────────────
// Faltaban estos handlers: la tab Ofertas llamaba PUT/PATCH/DELETE a esta ruta
// (que sólo tenía POST de IA) → editar, activar y borrar fallaban en silencio.

async function applyUpdate(req: NextRequest, { params }: RouteParams) {
  const _rl = await applyRateLimit(req, "MODERATE", "promotions-update"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = PromotionUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const updated = await PromotionsDB.update(auth.tenantId, id, parsed.data);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[promotions-id] update error", { id, error: String(e) });
    return NextResponse.json({ error: "Error actualizando la promoción" }, { status: 500 });
  }
}

export const PUT = applyUpdate;
export const PATCH = applyUpdate;

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const _rl = await applyRateLimit(req, "MODERATE", "promotions-delete"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await PromotionsDB.delete(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[promotions-id] delete error", { id, error: String(e) });
    return NextResponse.json({ error: "Error eliminando la promoción" }, { status: 500 });
  }
}
