/**
 * __tests__/membrete.test.ts
 *
 * Con qué nombre sale el negocio en la hoja semanal y el fotocheck. Medido el
 * 2026-09-14: el negocio de Blas tiene `Settings.businessName = ""` y `main`
 * null, así que los PDF salían sin nombre aunque el nombre registrado existe.
 */
import { describe, expect, it } from "vitest";
import { armarMembrete, cierreDelNegocio, conNombreDelNegocio } from "@/lib/admin/membrete";

describe("membrete del negocio para los PDF", () => {
  it("con el nombre configurado vacío usa el nombre registrado (caso Blas)", () => {
    const m = armarMembrete({ businessName: "", logoUrl: null }, { name: "Inversiones Agroforestales BLAS sac", logoUrl: null });
    expect(m).toEqual({ nombre: "Inversiones Agroforestales BLAS sac", logoUrl: null, telefono: null, direccion: null, ruc: null, pie: null });
  });

  it("el nombre y el logo configurados ganan a los registrados", () => {
    const m = armarMembrete(
      { businessName: "Aserradero Blas", logoUrl: "https://cdn/logo-config.png", businessPhone: "987 111 222" },
      { name: "Inversiones Agroforestales BLAS sac", logoUrl: "https://cdn/logo-tenant.png" },
    );
    expect(m).toMatchObject({ nombre: "Aserradero Blas", logoUrl: "https://cdn/logo-config.png", telefono: "987 111 222" });
  });

  it("sin logo configurado usa el del registro", () => {
    expect(armarMembrete({ businessName: "X" }, { name: "Y", logoUrl: "https://cdn/logo-tenant.png" }).logoUrl).toBe("https://cdn/logo-tenant.png");
  });

  it("recorta espacios y deja en null lo vacío", () => {
    expect(armarMembrete({ businessName: "   ", businessPhone: " 987 111 222 ", businessAddress: "" }, { name: " Buleje " })).toEqual({
      nombre: "Buleje",
      logoUrl: null,
      telefono: "987 111 222",
      direccion: null,
      ruc: null,
      pie: null,
    });
  });

  it("sin teléfono ni dirección configurados usa los de la tienda (caso Blas: la dirección vive en storeTheme)", () => {
    const m = armarMembrete(
      { businessName: "", businessPhone: "", businessAddress: "", storeTheme: { address: " Jr Jose Maria Arguedas Mz 24 Lote 04 " } },
      { name: "Inversiones Agroforestales BLAS sac" },
    );
    expect(m.telefono).toBeNull();
    expect(m.direccion).toBe("Jr Jose Maria Arguedas Mz 24 Lote 04");
    expect(armarMembrete({ storeTheme: { whatsapp: "987 000 111", phone: "" } }, null).telefono).toBe("987 000 111");
    expect(armarMembrete({ businessPhone: "961 222 333", storeTheme: { phone: "987 000 111" } }, null).telefono).toBe("961 222 333");
  });

  it("un valor de la tienda que no es texto no entra", () => {
    expect(armarMembrete({ storeTheme: { phone: 987000111, address: { calle: "x" } } }, null)).toMatchObject({ telefono: null, direccion: null });
  });

  it("sin datos de ningún lado, todo null", () => {
    expect(armarMembrete(null, null)).toEqual({ nombre: null, logoUrl: null, telefono: null, direccion: null, ruc: null, pie: null });
  });

  it("el pie y el RUC salen de Ajustes (el RUC de SUNAT sólo si no hay otro)", () => {
    expect(armarMembrete({ invoiceFooterText: "  Cambios en 7 días con tu ticket ", ruc: "20605859438" }, null)).toMatchObject({
      pie: "Cambios en 7 días con tu ticket",
      ruc: "20605859438",
    });
    expect(armarMembrete({ ruc: "", sunatRuc: "10456789012" }, null).ruc).toBe("10456789012");
  });
});

describe("firma de lo que recibe un cliente", () => {
  const musa = { nombre: "Musa", direccion: "Jr. Lima 123, Constitución", pie: null };

  it("título con el nombre del negocio; sin nombre, sólo el título (nunca el de la plataforma)", () => {
    expect(conNombreDelNegocio("Boleta", musa)).toBe("Boleta — Musa");
    expect(conNombreDelNegocio("Boleta", null)).toBe("Boleta");
    expect(conNombreDelNegocio("Boleta", { nombre: "  ", direccion: null, pie: null })).toBe("Boleta");
  });

  it("cierre: gracias + «nombre — dirección»; con pie, el pie va al final en lugar del gracias", () => {
    expect(cierreDelNegocio(musa, "¡Gracias por tu compra!")).toEqual(["¡Gracias por tu compra!", "Musa — Jr. Lima 123, Constitución"]);
    expect(cierreDelNegocio({ ...musa, pie: "Cambios en 7 días" }, "¡Gracias por tu compra!")).toEqual([
      "Musa — Jr. Lima 123, Constitución",
      "Cambios en 7 días",
    ]);
    expect(cierreDelNegocio({ nombre: "Musa", direccion: null, pie: null }, "")).toEqual(["Musa"]);
    expect(cierreDelNegocio(null, "¡Gracias!")).toEqual(["¡Gracias!"]);
  });
});
