/**
 * Seguimiento a clientes (ADR-508): a quién escribirle a los 3/15/30 días de su
 * última compra y con qué mensaje. Puro: no toca la base.
 */
import { describe, expect, it } from "vitest";
import {
  armarSeguimientos,
  configSeguimientoDeFlags,
  rellenarMensaje,
  type UltimaCompra,
} from "@/lib/agenda/seguimiento-clientas";

const compra = (p: Partial<UltimaCompra> = {}): UltimaCompra => ({
  telefono: "987654321",
  dia: "2026-10-17",
  nombre: "MARIA LOPEZ",
  producto: "Shampoo de romero",
  ...p,
});

describe("rellenarMensaje", () => {
  it("pone el primer nombre con mayúscula y el producto", () => {
    expect(rellenarMensaje("Hola, {nombre}. ¿Qué tal {producto}?", "MARIA LOPEZ", "Tónico")).toBe("Hola, Maria. ¿Qué tal Tónico?");
  });

  it("sin nombre se va también la coma; sin producto dice «tu compra»", () => {
    expect(rellenarMensaje("Hola, {nombre}. ¿Qué tal {producto}?", null, null)).toBe("Hola. ¿Qué tal tu compra?");
    expect(rellenarMensaje("{nombre}, ¿te separo {producto}?", "  ", "Crema")).toBe("¿Te separo Crema?");
  });

  it("un «nombre» con números o de relleno («Cliente 1004», «Público general») no se usa", () => {
    expect(rellenarMensaje("Hola, {nombre}.", "987654321", null)).toBe("Hola.");
    expect(rellenarMensaje("Hola, {nombre}.", "Cliente 1004", null)).toBe("Hola.");
    expect(rellenarMensaje("Hola, {nombre}.", "PUBLICO GENERAL", null)).toBe("Hola.");
  });
});

describe("configSeguimientoDeFlags", () => {
  it("sin config: prendido, días 3/15/30 y los mensajes genéricos", () => {
    const c = configSeguimientoDeFlags({});
    expect(c.activo).toBe(true);
    expect(c.dias).toEqual([3, 15, 30]);
    expect(c.mensajes["3"]).toContain("{producto}");
  });

  it("lo guardado manda, ordena y quita repetidos los días; los mensajes se suman a los de fábrica", () => {
    const c = configSeguimientoDeFlags({ seguimientoClientas: { dias: [30, 7, 7], mensajes: { "7": "Hola {nombre}" } } });
    expect(c.dias).toEqual([7, 30]);
    expect(c.mensajes["7"]).toBe("Hola {nombre}");
    expect(c.mensajes["30"]).toBeTruthy();
  });

  it("basura en la config vuelve al defecto en vez de romper la agenda", () => {
    expect(configSeguimientoDeFlags({ seguimientoClientas: { dias: [0, 999] } }).dias).toEqual([3, 15, 30]);
    expect(configSeguimientoDeFlags(null).activo).toBe(true);
    expect(configSeguimientoDeFlags({ seguimientoClientas: { activo: false } }).activo).toBe(false);
  });
});

describe("armarSeguimientos", () => {
  const cfg = configSeguimientoDeFlags({});

  it("compró el 17-10: le toca el 20-10 (día 3), el 01-11 (día 15) y el 16-11 (día 30)", () => {
    const fechas = armarSeguimientos([compra()], cfg, "2026-10-18", "2026-11-30").map((s) => [s.fecha, s.dia]);
    expect(fechas).toEqual([
      ["2026-10-20", 3],
      ["2026-11-01", 15],
      ["2026-11-16", 30],
    ]);
  });

  it("sólo los del rango pedido (hoy = 20-10 → sólo el de 3 días)", () => {
    const r = armarSeguimientos([compra(), compra({ telefono: "912345678", dia: "2026-10-10" })], cfg, "2026-10-20", "2026-10-20");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ dia: 3, compradoEl: "2026-10-17", nombre: "MARIA LOPEZ", id: "seg:987654321:2026-10-17" });
    expect(r[0].mensaje).toContain("Maria");
    expect(r[0].mensaje).toContain("Shampoo de romero");
    expect(r[0].whatsapp).toMatch(/^https:\/\/wa\.me\/51987654321\?text=/);
  });

  it("«celular» sin dígitos (s/n): sale igual, sin enlace", () => {
    const [s] = armarSeguimientos([compra({ telefono: "s/n" })], cfg, "2026-10-20", "2026-10-20");
    expect(s.whatsapp).toBeNull();
  });

  it("apagado = nada", () => {
    const off = configSeguimientoDeFlags({ seguimientoClientas: { activo: false } });
    expect(armarSeguimientos([compra()], off, "2026-10-01", "2026-12-31")).toEqual([]);
  });

  it("ordena por día que toca y después por nombre", () => {
    const r = armarSeguimientos(
      [compra({ telefono: "911111111", nombre: "Zoila" }), compra({ telefono: "922222222", nombre: "Ana" })],
      cfg,
      "2026-10-20",
      "2026-10-20",
    );
    expect(r.map((s) => s.nombre)).toEqual(["Ana", "Zoila"]);
  });
});
