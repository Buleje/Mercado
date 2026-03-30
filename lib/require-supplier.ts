import "server-only";
import { NextRequest } from "next/server";
import { getSupplierPayload, SUPPLIER_SESSION } from "@/lib/supplier-session";
import type { SupplierSessionPayload } from "@/lib/supplier-session";
import { logger } from "@/lib/logger";

/**
 * Verifica la sesión del portal de proveedor desde un API route.
 * Retorna el payload si la sesión es válida, o null si no está autenticado.
 *
 * Uso:
 *   const supplier = await requireSupplier(req);
 *   if (!supplier) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
 *   // supplier.supplierId, supplier.tenantId disponibles
 */
export async function requireSupplier(
  req: NextRequest,
): Promise<SupplierSessionPayload | null> {
  const token = req.cookies.get(SUPPLIER_SESSION.COOKIE_NAME)?.value;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const path = req.nextUrl.pathname;
  const method = req.method;

  if (!token) {
    logger.warn("[SUPPLIER-AUTH] No token", { method, path, ip });
    return null;
  }

  const payload = await getSupplierPayload(token);
  if (!payload) {
    logger.warn("[SUPPLIER-AUTH] Invalid/expired token", { method, path, ip });
    return null;
  }

  logger.debug("[SUPPLIER-AUTH] OK", {
    supplierId: payload.supplierId,
    tenantId: payload.tenantId,
    method,
    path,
  });

  return payload;
}
