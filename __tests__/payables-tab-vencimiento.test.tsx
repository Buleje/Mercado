/**
 * F11 — «Cuentas por pagar» mostraba el vencimiento un día antes.
 *
 * `dueDate` es una fecha DATE-only (columna DateTime guardada como medianoche
 * UTC, igual que entryDate/gtfDate — ver lib/format/index.ts). Formatearla sin
 * `{ soloFecha: true }` la corre a la zona Lima (UTC-5): medianoche UTC del
 * 15/10 es las 19:00 del 14/10 en Lima, así que `formatDate` sin la opción
 * devuelve «14 oct.» para una cuenta que vence el 15.
 *
 * Este test reproduce ESE dato exacto (2026-10-15T00:00:00.000Z, como lo
 * guarda `addPayable` con `new Date("2026-10-15").toISOString()`) y fija que
 * la pantalla muestre el día correcto.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PayablesTab from "@/components/admin/PayablesTab";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import type { DbPayable, DbSupplier } from "@/lib/jsondb";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const proveedor: DbSupplier = {
  id: "sup1",
  name: "Maderera QA",
  phone: "",
  email: "",
  address: "",
  ruc: "",
  notes: "",
  createdAt: "2026-09-01T00:00:00.000Z",
} as DbSupplier;

const cuenta: DbPayable = {
  id: "pay1",
  supplierId: "sup1",
  supplierName: "Maderera QA",
  description: "Factura #001",
  amount: 500,
  paidAmount: 0,
  status: "pendiente",
  dueDate: "2026-10-15T00:00:00.000Z",
  payments: [],
  createdAt: "2026-09-20T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PayablesTab — el vencimiento se lee como fecha DATE-only", () => {
  it("una cuenta que vence el 15/10 se muestra «15 oct.», no «14 oct.»", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u === "/api/payables") return jsonResponse([cuenta]);
      if (u === "/api/suppliers") return jsonResponse([proveedor]);
      return jsonResponse({}, 404);
    }) as typeof fetch;

    render(
      <ConfirmDialogProvider>
        <PayablesTab />
      </ConfirmDialogProvider>
    );

    expect(await screen.findByText(/Vence: 15 oct\./)).toBeInTheDocument();
    expect(screen.queryByText(/Vence: 14 oct\./)).not.toBeInTheDocument();
  });
});
