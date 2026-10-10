/**
 * Un cobro de fiado no es un ingreso suelto de caja.
 *
 * «Registrar ingreso» ofrecía el motivo «Cobro pendiente (fiado)»: la plata
 * entraba a la caja pero el saldo del fiado no bajaba, así que la deuda seguía
 * viva y el mismo cobro se podía registrar otra vez en Me deben (doble entrada
 * a la caja). Ahora el modal lleva a Me deben, que baja la deuda y anota la
 * entrada a la caja en la misma operación, y el servidor rechaza el ingreso
 * suelto con ese motivo (una pestaña vieja todavía lo puede mandar).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";

const { addMovement } = vi.hoisted(() => ({ addMovement: vi.fn() }));

vi.mock("@/lib/db/sales.db", () => ({ CashRegistersDB: { addMovement, getById: vi.fn(), close: vi.fn() } }));
vi.mock("@/lib/db/cash-registers-by-id.db", () => ({ CashRegisterOwnershipDB: { assertOwnership: vi.fn(async () => true) } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ tenantId: "t-bodega", username: "rosa", role: "cajero" })) }));
vi.mock("@/lib/mailer", () => ({ sendCashSummaryEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/create-notification", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: (_req: unknown, _user: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import { PATCH } from "@/app/api/cash-registers/[id]/route";
import { ModalMovimientoCaja } from "@/components/admin/caja/ModalMovimientoCaja";

function patch(cuerpo: unknown) {
  const req = new NextRequest("http://localhost/api/cash-registers/caja-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return PATCH(req, { params: Promise.resolve({ id: "caja-1" }) });
}

beforeEach(() => {
  addMovement.mockReset();
  addMovement.mockResolvedValue({ id: "mov-1" });
});
afterEach(() => cleanup());

describe("servidor: el ingreso suelto «Cobro pendiente» no entra a la caja", () => {
  it("rechaza «Cobro pendiente — doña Rosa» con 422 y no anota el movimiento", async () => {
    const res = await patch({ action: "movement", type: "ingreso", amount: 40, method: "efectivo", description: "Cobro pendiente — doña Rosa" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Me deben/);
    expect(addMovement).not.toHaveBeenCalled();
  });

  it("un ingreso extra sigue entrando (201)", async () => {
    const res = await patch({ action: "movement", type: "ingreso", amount: 40, method: "efectivo", description: "Ingreso extra — devolución" });
    expect(res.status).toBe(201);
    expect(addMovement).toHaveBeenCalledTimes(1);
  });
});

describe("modal «Registrar ingreso»: el cobro de fiado lleva a Me deben", () => {
  it("no ofrece el motivo «Cobro pendiente (fiado)»", () => {
    render(<ModalMovimientoCaja cajaId="caja-1" tipo="ingreso" onCerrar={vi.fn()} onHecho={vi.fn()} />);
    const motivos = screen.getAllByRole("option").map((o) => o.textContent ?? "");
    expect(motivos.join(" | ")).not.toMatch(/cobro pendiente|fiado/i);
  });

  it("enlaza a Ventas y caja › Me deben y cierra el modal al ir", () => {
    const onCerrar = vi.fn();
    render(<ModalMovimientoCaja cajaId="caja-1" tipo="ingreso" onCerrar={onCerrar} onHecho={vi.fn()} />);
    const enlace = screen.getByRole("link", { name: /me deben/i });
    expect(enlace.getAttribute("href")).toBe("/admin?tab=ventas-caja&vista=cuentas-cobrar");
    fireEvent.click(enlace);
    expect(onCerrar).toHaveBeenCalled();
  });

  it("un retiro no muestra el enlace de fiados", () => {
    render(<ModalMovimientoCaja cajaId="caja-1" tipo="egreso" onCerrar={vi.fn()} onHecho={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /me deben/i })).toBeNull();
  });
});
