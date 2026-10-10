import { describe, expect, it } from "vitest";
import {
  armarMensajePedido,
  avanceEnvio,
  avanceRegalo,
  esPorEncargo,
  hoyEnLima,
  pagosPara,
  preventaVigente,
  solesPedido,
  sugerirKit,
  WHATSAPP_MUSA,
  type KitSugerible,
  type LineaPedido,
} from "@/extensiones/pagina-musa/pedido-whatsapp";

const kit: LineaPedido = {
  nombre: "Kit Rutina facial",
  codigo: "KT02",
  cantidad: 1,
  precio: 179,
  porEncargo: false,
};
const fps: LineaPedido = {
  nombre: "Protector FPS 50",
  codigo: "MU013",
  cantidad: 1,
  precio: 79,
  porEncargo: false,
};

describe("armarMensajePedido (Musa · pedido por WhatsApp)", () => {
  it("arma el mensaje exacto con varios productos y el link a Drucila", () => {
    const r = armarMensajePedido({
      lineas: [kit, fps],
      nombre: "Ana",
      pueblo: "Ciudad Constitución",
      pago: "Yape",
    });
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
    const r = armarMensajePedido({
      lineas: [kit],
      nombre: "  María   Ñañez  ",
      pueblo: "Puerto Bermúdez",
      pago: "Plin",
    });
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
    expect(
      armarMensajePedido({
        lineas: [kit],
        nombre: "Ana",
        pueblo: "Oxapampa",
        pago: "Contraentrega",
      }),
    ).toEqual({
      ok: false,
      motivo: "contraentrega_fuera",
    });
    expect(pagosPara("Oxapampa")).not.toContain("Contraentrega");
    expect(pagosPara("Ciudad Constitución")).toContain("Contraentrega");
    expect(
      armarMensajePedido({
        lineas: [kit],
        nombre: "Ana",
        pueblo: "Ciudad Constitución",
        pago: "Contraentrega",
      }).ok,
    ).toBe(true);
  });

  it("un producto «Por encargo» agrega su línea de pago adelantado", () => {
    const plex: LineaPedido = {
      nombre: "Tratamiento reparador tipo «plex»",
      codigo: "MU004",
      cantidad: 1,
      precio: 89,
      porEncargo: true,
    };
    const r = armarMensajePedido({
      lineas: [plex, fps],
      nombre: "Ana",
      pueblo: "Otro",
      pago: "Yape",
    });
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
    expect(
      armarMensajePedido({ lineas: [kit], nombre: "   ", pueblo: "Otro", pago: "Yape" }),
    ).toEqual({ ok: false, motivo: "falta_nombre" });
    expect(armarMensajePedido({ lineas: [], nombre: "Ana", pueblo: "Otro", pago: "Yape" })).toEqual(
      { ok: false, motivo: "bolsa_vacia" },
    );
  });

  it("formatea soles: entero sin céntimos, con céntimos a dos decimales", () => {
    expect(solesPedido(258)).toBe("S/ 258");
    expect(solesPedido(49.9)).toBe("S/ 49.90");
  });
});

describe("avance de la bolsa (envío gratis y regalo de la campaña)", () => {
  it("en Constitución el envío es gratis desde el primer sol (barra llena)", () => {
    expect(avanceEnvio(0, "Ciudad Constitución")).toEqual({
      fraccion: 1,
      falta: 0,
      logrado: true,
      siempreGratis: true,
    });
  });

  it("fuera de Constitución cuenta lo que falta para S/ 99, en céntimos exactos", () => {
    const r = avanceEnvio(78, "Villa Rica");
    expect(r.falta).toBe(21);
    expect(r.logrado).toBe(false);
    expect(r.fraccion).toBeCloseTo(78 / 99);
    expect(avanceEnvio(98.9, "Otro").falta).toBe(0.1);
    expect(avanceEnvio(99, "Oxapampa")).toMatchObject({ falta: 0, logrado: true, fraccion: 1 });
    expect(avanceEnvio(240, "Puerto Bermúdez").fraccion).toBe(1);
  });

  it("el regalo de S/ 150 avisa antes del 9 nov, cuenta durante la campaña y desaparece después", () => {
    expect(avanceRegalo(120, "2026-10-10")).toMatchObject({ estado: "antes", falta: 30 });
    expect(avanceRegalo(120, "2026-11-09")).toMatchObject({
      estado: "activa",
      falta: 30,
      logrado: false,
    });
    expect(avanceRegalo(150, "2026-12-31")).toMatchObject({
      estado: "activa",
      falta: 0,
      logrado: true,
    });
    expect(avanceRegalo(500, "2027-01-01")).toBeNull();
  });

  it("el día de la campaña es el de Lima, no el del celular", () => {
    // 9 nov 03:00 UTC = 8 nov 22:00 en Lima: todavía no empieza.
    expect(hoyEnLima(new Date("2026-11-09T03:00:00Z"))).toBe("2026-11-08");
    expect(hoyEnLima(new Date("2026-11-09T05:00:00Z"))).toBe("2026-11-09");
  });
});

describe("sugerirKit («Drucila te sugiere»)", () => {
  // Precios de la base y composición del manual (§5).
  const precios: Record<string, number> = {
    MU001: 59,
    MU002: 59,
    MU003: 69,
    MU005: 49,
    MU009: 59,
    MU011: 59,
    MU013: 79,
    MU020: 59,
  };
  const precioDe = (c: string) => precios[c];
  const kits: KitSugerible[] = [
    { codigo: "KT01", precio: 149, componentes: ["MU001", "MU002", "MU005"] },
    { codigo: "KT03", precio: 159, componentes: ["MU001", "MU003", "MU005"] },
    { codigo: "KT05", precio: 125, componentes: ["MU013", "MU020"] },
    { codigo: "MU013-2", precio: 149, componentes: ["MU013", "MU013"] },
  ];

  it("con shampoo y acondicionador sugiere el KT01: falta el argán y ahorras S/ 18 (167 por separado)", () => {
    const s = sugerirKit(
      [
        { codigo: "MU001", cantidad: 1 },
        { codigo: "MU002", cantidad: 1 },
      ],
      kits,
      precioDe,
    );
    expect(s).toEqual({
      kit: "KT01",
      reemplaza: ["MU001", "MU002"],
      faltan: ["MU005"],
      porSeparado: 167,
      ahorro: 18,
    });
  });

  it("prefiere el kit que ya está completo en tu bolsa", () => {
    const s = sugerirKit(
      [
        { codigo: "MU013", cantidad: 2 },
        { codigo: "MU001", cantidad: 1 },
      ],
      kits,
      precioDe,
    );
    expect(s).toMatchObject({ kit: "MU013-2", faltan: [], porSeparado: 158, ahorro: 9 });
  });

  it("no sugiere un kit que ya llevas, ni uno sin precio de algún componente, ni sin nada en común", () => {
    expect(
      sugerirKit(
        [
          { codigo: "MU013", cantidad: 1 },
          { codigo: "KT05", cantidad: 1 },
          { codigo: "MU013-2", cantidad: 1 },
        ],
        kits,
        precioDe,
      ),
    ).toBeNull();
    expect(
      sugerirKit(
        [{ codigo: "MU009", cantidad: 1 }],
        [{ codigo: "KT02", precio: 179, componentes: ["MU009", "MU011", "MU099"] }],
        precioDe,
      ),
    ).toBeNull();
    expect(sugerirKit([{ codigo: "MU011", cantidad: 1 }], kits, precioDe)).toBeNull();
    expect(sugerirKit([{ codigo: null, cantidad: 3 }], kits, precioDe)).toBeNull();
  });

  it("sin ahorro real no hay sugerencia", () => {
    expect(
      sugerirKit(
        [{ codigo: "MU001", cantidad: 1 }],
        [{ codigo: "KT9", precio: 108, componentes: ["MU001", "MU005"] }],
        precioDe,
      ),
    ).toBeNull();
  });
});

describe("preventaVigente — la franja anuncia la preventa del manual sólo durante la Campaña 01", () => {
  it("vale hasta el 31 de diciembre de 2026 (día de Lima) y no después", () => {
    expect(preventaVigente("2026-10-10")).toBe(true);
    expect(preventaVigente("2026-12-31")).toBe(true);
    expect(preventaVigente("2027-01-01")).toBe(false);
  });
});
