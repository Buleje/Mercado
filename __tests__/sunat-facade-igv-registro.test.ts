/**
 * __tests__/sunat-facade-igv-registro.test.ts
 *
 * La emisión que usa la pantalla (facade `lib/integrations/sunat.ts`) guarda en
 * `SunatInvoice` el MISMO IGV que manda a Nubefact. Antes el registro salía de
 * `calculateIGV(total)` y el comprobante del IGV de cada línea: con 3 panes de
 * S/ 1 el comprobante decía 0,45 y el registro 0,46 (el IGV del mes suma el registro).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  findByOrderId: vi.fn(),
  getConfig: vi.fn(),
  incrementCorrelativo: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));
const nubefact = vi.hoisted(() => ({ sendInvoice: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/sunat.db", () => ({ SunatDB: db }));
vi.mock("@/lib/sunat/nubefact-client", () => ({
  sendInvoice: nubefact.sendInvoice,
  voidInvoice: vi.fn(),
  getInvoiceStatus: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  createDistributedRateLimiter: () => ({
    check: async () => true,
    remaining: async () => 9,
    distributed: false,
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { emitirBoleta, emitirFactura } from "@/lib/integrations/sunat";

const c = (soles: number) => Math.round(soles * 100);

/** Lo guardado en SunatInvoice y lo mandado a Nubefact, en céntimos. */
function registroYPayload() {
  const reg = db.createInvoice.mock.calls[0][1] as { subtotal: number; igv: number; total: number };
  const p = nubefact.sendInvoice.mock.calls[0][1] as { total_igv: number; total: number };
  return { reg, p };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.findByOrderId.mockResolvedValue(null);
  db.getConfig.mockResolvedValue({
    ruc: "20601234567",
    razonSocial: "BODEGA SAN MARTIN SAC",
    direccionFiscal: "Jr. Tarapacá 123, Pucallpa",
    boletaSeries: "B001",
    facturaSeries: "F001",
  });
  db.incrementCorrelativo.mockResolvedValue(7);
  db.createInvoice.mockResolvedValue({ id: "inv-1" });
  db.updateInvoice.mockResolvedValue({});
  nubefact.sendInvoice.mockResolvedValue({ sunat_accepted: true, nubefact_id: "nf-1" });
});

describe("facade SUNAT: el registro guarda el IGV del comprobante", () => {
  it("3 panes distintos de S/ 1: registro y comprobante dicen 0,45 (antes el registro 0,46)", async () => {
    const r = await emitirBoleta("t-qa", {
      items: ["Pan francés", "Pan de yema", "Pan integral"].map((descripcion) => ({
        codigo: "",
        descripcion,
        cantidad: 1,
        precioConIgv: 1,
        unidad: "NIU",
      })),
      clienteNombre: "CONSUMIDOR FINAL",
    });
    expect(r.success).toBe(true);
    const { reg, p } = registroYPayload();
    expect(c(p.total_igv)).toBe(45);
    expect(c(reg.igv)).toBe(c(p.total_igv));
    expect(c(reg.total)).toBe(c(p.total));
    expect(c(reg.subtotal) + c(reg.igv)).toBe(c(reg.total));
  });

  it("exonerado (Amazonía): el registro guarda IGV 0, igual que el comprobante", async () => {
    await emitirBoleta("t-qa", {
      items: [
        { codigo: "A1", descripcion: "Arroz", cantidad: 2, precioConIgv: 4.5, unidad: "NIU", afectacion: "exonerado" },
      ],
      clienteNombre: "CONSUMIDOR FINAL",
    });
    const { reg, p } = registroYPayload();
    expect(p.total_igv).toBe(0);
    expect(reg.igv).toBe(0);
    expect(c(reg.total)).toBe(900);
  });

  it("factura con descuento: registro y comprobante = lo cobrado, mismo IGV", async () => {
    await emitirFactura("t-qa", {
      clienteRuc: "20123456789",
      clienteRazonSocial: "CLIENTE SAC",
      items: [
        { codigo: "G1", descripcion: "Gaseosa", cantidad: 3, precioConIgv: 3.5, unidad: "NIU" },
        { codigo: "E1", descripcion: "Fideo", cantidad: 1, precioConIgv: 2.9, unidad: "NIU", afectacion: "exonerado" },
      ],
      totalCobrado: 12,
    });
    const { reg, p } = registroYPayload();
    expect(c(p.total)).toBe(1200);
    expect(c(reg.total)).toBe(1200);
    expect(c(reg.igv)).toBe(c(p.total_igv));
    expect(c(reg.subtotal) + c(reg.igv)).toBe(1200);
  });
});

describe("ningún camino de emisión vuelve a sacar el IGV del total entero", () => {
  it.each(["lib/integrations/sunat.ts", "app/api/sunat/emit/route.ts"])("%s no llama a calculateIGV(", (rel) => {
    const fuente = readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(fuente).not.toMatch(/calculateIGV\(/);
  });
});
