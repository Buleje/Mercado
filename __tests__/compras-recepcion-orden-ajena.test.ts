// @vitest-environment node
/**
 * Recepción contra una orden que no es (del todo) del negocio (10-10).
 *
 * REC-FB7F6C (09-10) se guardó contra `auto-1790922886062-osps27`: orden de
 * `main` con proveedor `sup-demo-4` y producto 1252621 de `demo`. El stock no se
 * movió sólo porque el producto se relee con `tenantId`; la recepción quedó
 * igual. Ahora: orden de otro negocio o inexistente → 404; orden propia con
 * proveedor o productos ajenos → 403. En los dos casos no se escribe nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  pertenencia: vi.fn(),
  receiptCreate: vi.fn(),
  ocFindFirst: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/db/goods-receipts.db", () => ({ GoodsReceiptsDB: { create: h.receiptCreate, list: vi.fn() } }));
vi.mock("@/lib/db/purchases.db", () => ({ PurchasesDB: { pertenencia: h.pertenencia } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { purchaseOrder: { findFirst: h.ocFindFirst }, $transaction: vi.fn() },
}));

import { POST } from "@/app/api/compras/recepciones/route";

function req(orderRef: string) {
  return new NextRequest("http://localhost/api/compras/recepciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderRef,
      supplier: "Frigorifico Amazonia EIRL",
      items: [{ product: "Atun Florida en Agua 170g", productId: 1252621, expectedQty: 40, receivedQty: 2, condition: "ok", notes: "" }],
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdmin.mockResolvedValue({ tenantId: "main", username: "qaadmin", role: "admin" });
});

describe("POST /api/compras/recepciones con orden ajena", () => {
  it("orden propia con proveedor y producto de otro negocio → 403, sin recepción ni stock", async () => {
    h.pertenencia.mockResolvedValue({ existe: true, proveedorAjeno: true, productosAjenos: [1252621] });
    const res = await POST(req("auto-1790922886062-osps27"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ proveedorAjeno: true, productosAjenos: [1252621] });
    expect(h.pertenencia).toHaveBeenCalledWith("main", "auto-1790922886062-osps27");
    expect(h.receiptCreate).not.toHaveBeenCalled();
    expect(h.ocFindFirst).not.toHaveBeenCalled();
  });

  it("orden de otro negocio (o que no existe) → 404, sin recepción", async () => {
    h.pertenencia.mockResolvedValue({ existe: false, proveedorAjeno: false, productosAjenos: [] });
    const res = await POST(req("po-de-demo"));
    expect(res.status).toBe(404);
    expect(h.receiptCreate).not.toHaveBeenCalled();
  });
});
