/**
 * POST /api/marketplace/qa/[productId]/answer
 *
 * SECURITY 2026-05-06 (audit team H004):
 *  - `isVendor` ya NO se acepta del body (mass-assignment). Se deriva del
 *    role del usuario autenticado: admin/vendor → true, customer → false
 *  - tenantId se deriva del producto (no más "global" hardcoded)
 *  - userId se toma de la session (no más Date.now() predecible)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductQADB } from "@/lib/db/product-qa.db";
import { MarketplaceProductsDB } from "@/lib/db/marketplace-products.db";
import { logger } from "@/lib/logger";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { applyRateLimit } from "@/lib/rate-limit";

const Body = z.object({
  questionId: z.string().min(1).max(100),
  userName: z.string().min(1).max(80),
  body: z.string().min(5).max(1000),
  // FIX H004: isVendor REMOVIDO del schema — ya no aceptamos del body.
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  // Audit 2026-06-10 P2: rate limit anti-spam (faltaba; punto abierto del
  // baseline de seguridad). La sesión de customer ya era obligatoria.
  const _rl = await applyRateLimit(req, "STRICT", "qa-answer");
  if (_rl) return _rl;
  const { productId } = await context.params;
  const productIdNum = parseInt(productId, 10);
  if (Number.isNaN(productIdNum)) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Resolver tenantId desde el producto (no hardcoded "global")
  // Audit project-wide 2026-05-19: migrado a MarketplaceProductsDB.
  const tenantIdResolved = await MarketplaceProductsDB.getTenantById(productIdNum);
  if (!tenantIdResolved) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  // Auth: customer-session obligatorio para evitar spam anónimo.
  // isVendor solo true si admin del tenant del producto (RBAC futuro);
  // por ahora siempre false porque no hay vendor-session ligado al storefront.
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
  if (!session) {
    return NextResponse.json({ error: "Iniciá sesión para responder" }, { status: 401 });
  }

  // userId desde session (no Date.now() predecible)
  const userId = session.customerId ?? session.email;
  // isVendor: derivado de role real, no del body.
  // Por ahora customer = false. Cuando exista admin-session del vendor en
  // el storefront público, comparar session.role === "vendor" + tenantId.
  const isVendor = false;

  try {
    const answer = await ProductQADB.createAnswer({
      tenantId: tenantIdResolved,
      questionId: parsed.data.questionId,
      userId,
      userName: parsed.data.userName,
      isVendor,
      body: parsed.data.body,
    });
    return NextResponse.json({ data: answer }, { status: 201 });
  } catch (err) {
    logger.error("[marketplace/qa/answer] create failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
