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
    expect(m).toEqual({ nombre: "Inversiones Agroforestales BLAS sac", logoUrl: null, telefono: null, direccion: null, ruc: null, pie: null, razonSocial: null, correo: null, nombreComercial: null, whatsapp: null, fuenteLogo: null, logoPngUrl: null });
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
      razonSocial: null,
      correo: null,
      nombreComercial: null,
      whatsapp: null,
      fuenteLogo: null,
      logoPngUrl: null,
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
    expect(armarMembrete(null, null)).toEqual({ nombre: null, logoUrl: null, telefono: null, direccion: null, ruc: null, pie: null, razonSocial: null, correo: null, nombreComercial: null, whatsapp: null, fuenteLogo: null, logoPngUrl: null });
  });

  it("el pie y el RUC salen de Ajustes (el RUC de SUNAT sólo si no hay otro)", () => {
    expect(armarMembrete({ invoiceFooterText: "  Cambios en 7 días con tu ticket ", ruc: "20605859438" }, null)).toMatchObject({
      pie: "Cambios en 7 días con tu ticket",
      ruc: "20605859438",
    });
    expect(armarMembrete({ ruc: "", sunatRuc: "10456789012" }, null).ruc).toBe("10456789012");
  });

  // ADR-514 (23-10): el título es nombre comercial › razón social › nombre registrado.
  it("título: con nombre comercial vacío va la razón social antes que el nombre registrado (Blas medido 23-10)", () => {
    const m = armarMembrete(
      { businessName: "", razonSocial: "INVERSIONES AGROFORESTALES BLAS SOCIEDAD ANONIMA CERRADA" },
      { name: "Inversiones Agroforestales BLAS sac" },
    );
    expect(m).toMatchObject({ nombre: "INVERSIONES AGROFORESTALES BLAS SOCIEDAD ANONIMA CERRADA", nombreComercial: null });
    expect(armarMembrete({ businessName: "Aserradero Blas", razonSocial: "INVERSIONES BLAS SAC" }, { name: "x" }).nombre).toBe("Aserradero Blas");
    expect(armarMembrete({ razonSocial: "", sunatDenominacion: " BLAS SAC " }, { name: "x" })).toMatchObject({ nombre: "BLAS SAC", razonSocial: "BLAS SAC" });
  });

  it("nunca pone el nombre de la plataforma: sin dato, null", () => {
    const m = armarMembrete({ businessName: "", razonSocial: "  " }, { name: "", logoUrl: "" });
    expect(m.nombre).toBeNull();
    expect(JSON.stringify(m)).not.toMatch(/buleje/i);
  });

  it("de dónde sale el logo y su versión en PNG (cambia con el logo)", () => {
    const a = armarMembrete({ logoUrl: "https://x/a.webp" }, { logoUrl: "https://x/t.png" });
    expect(a.fuenteLogo).toBe("ajustes");
    expect(a.logoPngUrl).toMatch(/^\/api\/admin\/membrete\/logo\?v=[a-z0-9]+$/);
    const t = armarMembrete({ logoUrl: "" }, { logoUrl: "https://x/t.png" });
    expect(t.fuenteLogo).toBe("registro");
    expect(t.logoPngUrl).not.toBe(a.logoPngUrl);
    expect(armarMembrete({}, {})).toMatchObject({ fuenteLogo: null, logoPngUrl: null });
  });

  it("el WhatsApp de la tienda sale aparte del teléfono", () => {
    expect(armarMembrete({ businessPhone: "961 222 333", storeTheme: { whatsapp: " 987 000 111 " } }, null)).toMatchObject({
      telefono: "961 222 333",
      whatsapp: "987 000 111",
    });
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
