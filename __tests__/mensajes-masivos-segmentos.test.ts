import { describe, expect, it } from "vitest";
import { aplicarPlantilla, enlaceWhatsApp, perteneceAlSegmento, type Destinatario } from "@/components/admin/mensajes-masivos/shared";

const AHORA = Date.parse("2026-10-10T12:00:00Z");
const hace = (dias: number) => new Date(AHORA - dias * 86400000).toISOString();
const cliente = (o: Partial<Destinatario> = {}): Destinatario => ({
  phone: "955123456", name: "María", totalSpent: 0, debt: 0, lastOrderDate: null, orderCount: 0, ...o,
});

describe("segmentos de mensajes masivos (mismas reglas que «Mis clientes»)", () => {
  it("activo = compró en los últimos 30 días; sin compras es inactivo", () => {
    expect(perteneceAlSegmento(cliente({ lastOrderDate: hace(5), orderCount: 1 }), "activos-30", null, AHORA)).toBe(true);
    expect(perteneceAlSegmento(cliente({ lastOrderDate: hace(45), orderCount: 1 }), "activos-30", null, AHORA)).toBe(false);
    expect(perteneceAlSegmento(cliente(), "inactivos-30", null, AHORA)).toBe(true);
  });
  it("deuda sale de creditBalance y alto valor desde S/ 200", () => {
    expect(perteneceAlSegmento(cliente({ debt: 15 }), "deuda", null, AHORA)).toBe(true);
    expect(perteneceAlSegmento(cliente({ totalSpent: 199 }), "alto-valor", null, AHORA)).toBe(false);
    expect(perteneceAlSegmento(cliente({ totalSpent: 200 }), "alto-valor", null, AHORA)).toBe(true);
  });
  it("frecuente y perdido usan inferSegment", () => {
    expect(perteneceAlSegmento(cliente({ orderCount: 6, lastOrderDate: hace(3) }), "frecuente", null, AHORA)).toBe(true);
    expect(perteneceAlSegmento(cliente({ orderCount: 6, lastOrderDate: hace(120) }), "perdido", null, AHORA)).toBe(true);
  });
  it("el preset compara solo dígitos", () => {
    const set = new Set(["955123456"]);
    expect(perteneceAlSegmento(cliente({ phone: "955 123 456" }), "rfm-preset", set, AHORA)).toBe(true);
    expect(perteneceAlSegmento(cliente({ phone: "900000000" }), "rfm-preset", set, AHORA)).toBe(false);
  });
});

describe("mensaje y enlace", () => {
  it("reemplaza las variables", () => {
    const c = cliente({ debt: 15 });
    expect(aplicarPlantilla("Hola {nombre}, debes {deuda}", c)).toContain("Hola María, debes");
    expect(aplicarPlantilla("{ultimaCompra}", c)).toBe("una fecha anterior");
  });
  it("arma el enlace con 51 una sola vez y sin número devuelve null", () => {
    expect(enlaceWhatsApp(cliente(), "hola")).toBe("https://wa.me/51955123456?text=hola");
    expect(enlaceWhatsApp(cliente({ phone: "51955123456" }), "hola")).toBe("https://wa.me/51955123456?text=hola");
    expect(enlaceWhatsApp(cliente({ phone: "" }), "hola")).toBeNull();
  });
});
