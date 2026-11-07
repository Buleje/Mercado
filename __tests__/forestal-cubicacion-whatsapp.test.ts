/**
 * El mensaje de WhatsApp de una guardada (24-10): número normalizado a 51…,
 * texto con PT entero y m³ a 3 decimales, y un enlace que sólo abre WhatsApp.
 */
import { describe, expect, it } from "vitest";
import { fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { construirRegistro } from "@/lib/forestal/cubicacion-registro";
import { celularDeParte, celularPeru, enlaceWhatsApp, textoWhatsAppDeGuardada } from "@/lib/forestal/cubicacion-whatsapp";

const pz = (id: string, cantidad: number, especie: string) => ({
  id, cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie,
});

describe("celularPeru", () => {
  it.each([
    ["987 654 321", "51987654321"],
    ["+51 987-654-321", "51987654321"],
    ["0051987654321", "51987654321"],
    ["51987654321", "51987654321"],
  ])("%s → %s", (raw, esperado) => expect(celularPeru(raw)).toBe(esperado));

  it.each([["061 575 123"], ["12345"], [""], [null], [undefined]])("%s → null (no es celular)", (raw) => expect(celularPeru(raw)).toBeNull());

  it("celularDeParte salta el fijo y toma el primer celular válido", () => {
    expect(celularDeParte({ whatsapp: "", telefono: "061575123", contactoTelefono: "999111222" })).toBe("51999111222");
    expect(celularDeParte(null)).toBeNull();
  });
});

describe("textoWhatsAppDeGuardada", () => {
  const c = construirRegistro({
    nombre: "Lote Tornillo",
    cliente: "Pérez",
    notas: "Madera seca",
    precioPt: 2,
    gtfNumber: "G-001",
    ficha: { comunidad: "CCNN San Luis", placa: "ABC-123" },
    piezas: [pz("1", 10, "Tornillo"), pz("2", 4, "Cumala")],
  });
  const texto = textoWhatsAppDeGuardada(c, "jueves 10/09");

  it("trae la ficha, cada especie, el total y las notas con *negritas* en los títulos", () => {
    expect(texto).toContain("*Cubicación · Lote Tornillo*");
    expect(texto).toContain("jueves 10/09");
    for (const s of ["Comprador: Pérez", "CCNN: CCNN San Luis", "GTF: G-001", "Placa: ABC-123", "• Tornillo:", "• Cumala:", "*Total*", "*Notas*\nMadera seca"]) expect(texto).toContain(s);
  });

  it("PT entero y m³ con 3 decimales; el importe es el guardado", () => {
    expect(texto).toMatch(/14 piezas · \d+ PT · \d+[.,]\d{3} m³/);
    expect(texto).toContain(`*Importe: S/ ${fmtSoles(c.valor)}*`);
  });

  it("sin precio no escribe importe; sin ficha no deja líneas vacías", () => {
    const sin = textoWhatsAppDeGuardada(construirRegistro({ nombre: "X", piezas: [pz("1", 1, "Tornillo")] }), "lunes 01/01");
    expect(sin).not.toContain("Importe");
    expect(sin).not.toContain("Comprador");
  });
});

describe("enlaceWhatsApp", () => {
  it("con número abre ese chat; sin número deja elegir el contacto", () => {
    expect(enlaceWhatsApp("hola a", "51987654321")).toBe("https://wa.me/51987654321?text=hola%20a");
    expect(enlaceWhatsApp("hola", null)).toBe("https://wa.me/?text=hola");
  });
});
