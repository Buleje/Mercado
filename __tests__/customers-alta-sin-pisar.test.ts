/**
 * Seguridad 17-10, punto 5 — CustomersDB.altaSinPisar: el alta del panel ya
 * no pisa al cliente que existe (el upsert le cambiaba el nombre y le borraba
 * las direcciones guardadas). Encuentra los formatos viejos del celular, guarda
 * el límite de crédito del alta y resuelve el P2002 de dos altas a la vez.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/prisma-rls", () => ({
  withRlsTx: (_t: string, fn: (tx: unknown) => unknown) =>
    fn({ customer: { findFirst: h.findFirst, create: h.create, update: h.update } }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { CustomersDB } from "@/lib/db/customers.db";

const ahora = new Date("2026-10-17T07:00:00Z");
const fila = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  phone: "51987654321",
  name: "Juan de verdad",
  email: null,
  location: "Jr. Lima 100",
  reference: "",
  locations: [{ id: "l1", location: "Jr. Lima 100", reference: "" }],
  activeLocationId: "l1",
  birthday: null,
  aiNotes: null,
  aiNotesDate: null,
  loyaltyPoints: 40,
  loyaltyTier: "Plata",
  totalSpent: 120,
  privateNotes: null,
  referralCode: null,
  referredBy: null,
  creditBalance: 0,
  creditLimit: 0,
  tags: null,
  lat: null,
  lng: null,
  notifOrderUpdates: true,
  notifPromotions: true,
  notifRestock: true,
  documento: "44556677",
  tipoDocumento: "DNI",
  razonSocial: null,
  createdAt: ahora,
  updatedAt: ahora,
  ...extra,
});
const ALTA = { phone: "987654321", name: "Nombre escrito en la caja", creditLimit: 250 };

beforeEach(() => vi.clearAllMocks());

describe("CustomersDB.altaSinPisar", () => {
  it("celular que ya es de un cliente (en formato viejo 51…): lo devuelve y NO escribe", async () => {
    h.findFirst.mockResolvedValueOnce(fila());
    const r = await CustomersDB.altaSinPisar("t-a", ALTA);
    expect(r).toMatchObject({
      estado: "existe",
      cliente: { phone: "51987654321", name: "Juan de verdad" },
      identificacion: { documento: "44556677", tipoDocumento: "DNI", razonSocial: null },
    });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    const where = h.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t-a");
    expect(where.phone.in).toEqual(expect.arrayContaining(["987654321", "51987654321", "+51987654321"]));
  });

  it("celular nuevo: lo crea en este negocio con el límite de crédito del alta", async () => {
    h.findFirst.mockResolvedValueOnce(null);
    h.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      fila({ ...data, phone: data.phone, name: data.name, locations: [], creditLimit: data.creditLimit ?? 0 }),
    );
    const r = await CustomersDB.altaSinPisar("t-a", ALTA);
    expect(r.estado).toBe("creado");
    const data = h.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ phone: "987654321", tenantId: "t-a", creditLimit: 250 });
  });

  it("dos altas a la vez del mismo celular: la que pierde (P2002) devuelve el que quedó", async () => {
    h.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(fila({ phone: "987654321" }));
    h.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const r = await CustomersDB.altaSinPisar("t-a", ALTA);
    expect(r).toMatchObject({ estado: "existe", cliente: { phone: "987654321" } });
  });

  it("P2002 y no está en este negocio: es de otra tienda, sin datos del ajeno", async () => {
    h.findFirst.mockResolvedValue(null);
    h.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(CustomersDB.altaSinPisar("t-a", ALTA)).resolves.toEqual({ estado: "otra_tienda" });
  });

  it("otro error de la base sigue de largo", async () => {
    h.findFirst.mockResolvedValue(null);
    h.create.mockRejectedValue(new Error("timeout"));
    await expect(CustomersDB.altaSinPisar("t-a", ALTA)).rejects.toThrow("timeout");
  });
});
