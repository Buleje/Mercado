/**
 * __tests__/oc-recurrentes-pausar-activar.test.tsx
 *
 * Órdenes › Recurrentes sólo listaba las activas: una plantilla de Punto de
 * compra (nace pausada) o una recurrencia detenida no se veía ni se podía
 * activar (09-10). Ahora las pausadas van en «Pausados» con «Activar», y cada
 * activa tiene «Pausar». Activar una cuya fecha ya pasó la corre a un ciclo
 * desde hoy: si no, nacería «Atrasada» y avisaría en el acto.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));

import PurchaseOrdersTab from "@/components/admin/PurchaseOrdersTab";

const DIA = 86_400_000;
const item = { productId: 1, name: "Arroz extra", quantity: 10, unitCost: 3.5, unit: "kg" };
const base = {
  supplierId: "s1",
  supplierName: "Distribuidora Pucallpa",
  items: [item],
  intervalDays: 15,
  notifyDaysBefore: 2,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const ACTIVA = { ...base, id: "r1", active: true, nextDate: new Date(Date.now() + 10 * DIA).toISOString() };
const PLANTILLA = { ...base, id: "r2", active: false, notes: "Abarrotes del lunes", nextDate: "2026-01-01T00:00:00.000Z" };

type Llamada = { url: string; metodo: string; cuerpo: unknown };
let llamadas: Llamada[] = [];

beforeEach(() => {
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      llamadas.push({ url, metodo, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json =
        url === "/api/compras/recurrentes" ? [ACTIVA, PLANTILLA]
        : url === "/api/suppliers" ? { suppliers: [] }
        : metodo === "PATCH" ? {}
        : [];
      return { ok: true, status: 200, json: async () => json };
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const patches = () => llamadas.filter((l) => l.metodo === "PATCH");

describe("Órdenes › Recurrentes — pausar y activar", () => {
  it("lista la plantilla pausada y al activarla corre la fecha vencida a un ciclo desde hoy", async () => {
    render(<PurchaseOrdersTab />);
    const activar = await screen.findByRole("button", { name: "Activar Abarrotes del lunes" });
    const antes = Date.now();
    await act(async () => { fireEvent.click(activar); });
    await waitFor(() => expect(patches()).toHaveLength(1));
    const [p] = patches();
    expect(p.url).toBe("/api/compras/recurrentes/r2");
    const cuerpo = p.cuerpo as { active: boolean; nextDate: string };
    expect(cuerpo.active).toBe(true);
    const proxima = new Date(cuerpo.nextDate).getTime();
    expect(proxima).toBeGreaterThanOrEqual(antes + 15 * DIA - 1000);
    expect(proxima).toBeLessThanOrEqual(Date.now() + 15 * DIA + 1000);
  });

  it("pausar una activa manda sólo active:false (la fecha futura no se toca)", async () => {
    render(<PurchaseOrdersTab />);
    const pausar = await screen.findByRole("button", { name: "Pausar pedido recurrente" });
    await act(async () => { fireEvent.click(pausar); });
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].url).toBe("/api/compras/recurrentes/r1");
    expect(patches()[0].cuerpo).toEqual({ active: false });
  });
});
