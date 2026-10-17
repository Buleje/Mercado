/**
 * El recibo por WhatsApp sale firmado por el negocio que vendió, no por la
 * plataforma: antes cerraba con «Bodega Buleje, Pucallpa» en cualquier tienda.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/membrete.db", () => ({ MembreteDB: { del: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { buildReceiptText } from "@/lib/receipt-whatsapp";

const pedido = { id: "ord_abc12345", items: [{ name: "Arroz", quantity: 2, price: 4.5 }], total: 9, paymentMethod: "yape" };

describe("recibo por WhatsApp", () => {
  it("con el negocio: su nombre arriba, y abajo el gracias, «nombre — dirección» y su pie", () => {
    const texto = buildReceiptText(pedido, "Ana", { nombre: "Musa", direccion: "Constitución", pie: "Cambios en 7 días" });
    expect(texto.split("\n")[0]).toBe("🧾 *Recibo — Musa*");
    expect(texto.trimEnd().split("\n").slice(-3)).toEqual(["¡Gracias por tu compra, *Ana*! 🙏", "Musa — Constitución", "Cambios en 7 días"]);
    expect(texto).not.toMatch(/Buleje/);
  });

  it("sin datos del negocio: sin firma, nunca con la de la plataforma", () => {
    const texto = buildReceiptText(pedido, "Ana");
    expect(texto.split("\n")[0]).toBe("🧾 *Recibo*");
    expect(texto).not.toMatch(/Buleje|Pucallpa/);
  });
});
