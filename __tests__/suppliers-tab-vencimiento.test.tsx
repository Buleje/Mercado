/**
 * F11 (barrido) — «Proveedores» clasificaba vencido/próximo a vencer comparando
 * `new Date(dueDate).setHours(0,0,0,0)` en hora LOCAL del navegador contra
 * `new Date()`. `dueDate` es DATE-only guardado como medianoche UTC: en Lima
 * (UTC-5) esa medianoche cae en el día anterior, así que una cuenta que vence
 * el 15 ya se mostraba «vencida» el 15 a las 20:00 (hora Lima).
 *
 * `diasHastaVencer` ahora compara por CLAVE de día (fecha UTC del dueDate vs.
 * `limaDateKey()` de hoy) — ver components/admin/SuppliersTab.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SuppliersTab from "@/components/admin/SuppliersTab";
import type { DbSupplier } from "@/lib/jsondb";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const proveedor: DbSupplier = {
  id: "sup1",
  name: "Maderera QA",
} as DbSupplier;

const cuentaVence15 = {
  id: "pay1",
  supplierId: "sup1",
  supplierName: "Maderera QA",
  amount: 500,
  paidAmount: 0,
  status: "pendiente",
  dueDate: "2026-10-15T00:00:00.000Z",
  description: "Factura #001",
  createdAt: "2026-09-01T00:00:00.000Z",
};

function stubFetch() {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u === "/api/suppliers") return jsonResponse([proveedor]);
    if (u === "/api/payables") return jsonResponse([cuentaVence15]);
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

async function abrirAlertas() {
  const boton = await screen.findByRole("button", { name: /Ver alertas/i });
  fireEvent.click(boton);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SuppliersTab — vencido/próximo por día de calendario, no por hora local", () => {
  beforeEach(() => {
    stubFetch();
  });

  it("hoy 15/10 a las 20:00 Lima: una cuenta que vence el 15 dice «Vence hoy», no vencida", async () => {
    // 2026-10-15 20:00 America/Lima (UTC-5) = 2026-10-16T01:00:00.000Z.
    // `shouldAdvanceTime`: el reloj real sigue corriendo (lo necesitan los
    // `findBy*` de Testing Library, que hacen polling con setTimeout real).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-16T01:00:00.000Z"));

    render(<SuppliersTab />);
    await abrirAlertas();

    expect(await screen.findByText("Vence hoy")).toBeInTheDocument();
    expect(screen.queryByText(/días vencido/)).not.toBeInTheDocument();
  });

  it("hoy 16/10 (un día después): la misma cuenta ya está vencida", async () => {
    // 2026-10-16 12:00 America/Lima = 2026-10-16T17:00:00.000Z.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-16T17:00:00.000Z"));

    render(<SuppliersTab />);
    await abrirAlertas();

    expect(await screen.findByText("1 días vencido")).toBeInTheDocument();
    expect(screen.queryByText("Vence hoy")).not.toBeInTheDocument();
  });
});
