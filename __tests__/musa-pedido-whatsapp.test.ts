import { describe, expect, it } from "vitest";
import {
  armarMensajePedido,
  esPorEncargo,
  pagosPara,
  solesPedido,
  WHATSAPP_MUSA,
  type LineaPedido,
} from "@/extensiones/pagina-musa/pedido-whatsapp";

const kit: LineaPedido = { nombre: "Kit Rutina facial", codigo: "KT02", cantidad: 1, precio: 179, porEncargo: false };
const fps: LineaPedido = { nombre: "Protector FPS 50", codigo: "MU013", cantidad: 1, precio: 79, porEncargo: false };

describe("armarMensajePedido (Musa · pedido por WhatsApp)", () => {
  it("arma el mensaje exacto con varios productos y el link a Drucila", () => {
    const r = armarMensajePedido({ lineas: [kit, fps], nombre: "Ana", pueblo: "Ciudad Constitución", pago: "Yape" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensaje).toBe(
      [
        "Hola Drucila, quiero:",
        "• 1 × Kit Rutina facial (KT02) S/ 179",
        "• 1 × Protector FPS 50 (MU013) S/ 79",
        "Total: S/ 258",
        "Nombre: Ana",
        "Entrega: Ciudad Constitución",
        "Pago: Yape",
      ].join("\n"),
    );
    expect(r.total).toBe(258);
    expect(r.url.startsWith(`https://wa.me/${WHATSAPP_MUSA}?text=`)).toBe(true);
    expect(decodeURIComponent(r.url.split("?text=")[1])).toBe(r.mensaje);
  });

  it("conserva tildes y ñ al codificar (nombre y pueblo)", () => {
    const r = armarMensajePedido({ lineas: [kit], nombre: "  María   Ñañez  ", pueblo: "Puerto Bermúdez", pago: "Plin" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensaje).toContain("Nombre: María Ñañez");
    expect(r.mensaje).toContain("Entrega: Puerto Bermúdez");
    expect(r.url).toContain(encodeURIComponent("María Ñañez"));
    expect(decodeURIComponent(r.url.split("?text=")[1])).toBe(r.mensaje);
  });

  it("multiplica la cantidad y suma el total con céntimos sin errores de coma flotante", () => {
    const r = armarMensajePedido({
      lineas: [
        { nombre: "Mascarillas", codigo: "MU016", cantidad: 3, precio: 0.1, porEncargo: false },
        { nombre: "Sérum", codigo: "MU012", cantidad: 1, precio: 49.9, porEncargo: false },
      ],
      nombre: "Rosa",
      pueblo: "Villa Rica",
      pago: "Transferencia",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensaje).toContain("• 3 × Mascarillas (MU016) S/ 0.30");
    expect(r.mensaje).toContain("Total: S/ 50.20");
    expect(r.total).toBe(50.2);
  });

  it("bloquea la contraentrega fuera de Constitución", () => {
    expect(armarMensajePedido({ lineas: [kit], nombre: "Ana", pueblo: "Oxapampa", pago: "Contraentrega" })).toEqual({
      ok: false,
      motivo: "contraentrega_fuera",
    });
    expect(pagosPara("Oxapampa")).not.toContain("Contraentrega");
    expect(pagosPara("Ciudad Constitución")).toContain("Contraentrega");
    expect(armarMensajePedido({ lineas: [kit], nombre: "Ana", pueblo: "Ciudad Constitución", pago: "Contraentrega" }).ok).toBe(true);
  });

  it("un producto «Por encargo» agrega su línea de pago adelantado", () => {
    const plex: LineaPedido = { nombre: "Tratamiento reparador tipo «plex»", codigo: "MU004", cantidad: 1, precio: 89, porEncargo: true };
    const r = armarMensajePedido({ lineas: [plex, fps], nombre: "Ana", pueblo: "Otro", pago: "Yape" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const renglones = r.mensaje.split("\n");
    expect(renglones[1]).toBe("• 1 × Tratamiento reparador tipo «plex» (MU004) S/ 89");
    expect(renglones[2]).toBe("(por encargo: pago 100 % adelantado)");
    expect(renglones[3]).toBe("• 1 × Protector FPS 50 (MU013) S/ 79");
    expect(r.mensaje.match(/por encargo/g)).toHaveLength(1);
    expect(esPorEncargo("Por encargo")).toBe(true);
    expect(esPorEncargo("Preventa")).toBe(false);
  });

  it("pide nombre y bolsa con algo", () => {
    expect(armarMensajePedido({ lineas: [kit], nombre: "   ", pueblo: "Otro", pago: "Yape" })).toEqual({ ok: false, motivo: "falta_nombre" });
    expect(armarMensajePedido({ lineas: [], nombre: "Ana", pueblo: "Otro", pago: "Yape" })).toEqual({ ok: false, motivo: "bolsa_vacia" });
  });

  it("formatea soles: entero sin céntimos, con céntimos a dos decimales", () => {
    expect(solesPedido(258)).toBe("S/ 258");
    expect(solesPedido(49.9)).toBe("S/ 49.90");
  });
});
