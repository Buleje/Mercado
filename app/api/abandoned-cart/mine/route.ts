import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * GET /api/abandoned-cart/mine
 *
 * #31 Abandoned cart recovery — endpoint UX front.
 * Devuelve el carrito abandonado del cliente autenticado si existe.
 *
 * Sin modelo AbandonedCart en Prisma: devuelve 404 gracioso.
 * El CartRecoveryToast maneja el 404 sin mostrar UI.
 * Extensible: cuando se agregue modelo DB, reemplazar el cuerpo
 * con la query correspondiente usando lib/db/*.db.ts.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "main";

  try {
    // Sin modelo AbandonedCart en Prisma — no hay cart persistido server-side.
    // Logging para observabilidad en produccion.
    logger.info("[abandoned-cart/mine] GET — no DB model, returning 404", {
      tenantId,
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    return NextResponse.json(
      { error: "No abandoned cart found" },
      { status: 404 }
    );
  } catch (err) {
    logger.error("[abandoned-cart/mine] unexpected error", { err, tenantId });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
