import { describe, it, expect } from "vitest";
import { normalizarCodigoTienda, formatearCodigoTienda, tienePrefijoDeId, CODIGO_TIENDA_RE } from "@/lib/codigo-tienda";
import { coincideNegocio, aNegocioBuscable } from "@/lib/superadmin/buscar-negocio";

// ADR-500: el ID de soporte de una tienda, 6 dígitos sin guion en la base.

describe("normalizarCodigoTienda", () => {
  it("acepta el ID escrito como lo manda un dueño por WhatsApp", () => {
    for (const q of ["482917", "482-917", "482 917", "#482 917", "#482917", "ID 482917", "id: 482-917", "ID 482.917", "  Id 482-917 ", "N° 482917"]) {
      expect(normalizarCodigoTienda(q), q).toBe("482917");
    }
  });
  it("rechaza lo que no es un ID completo", () => {
    for (const q of ["", "48291", "4829170", "012345", "48a917", "ID", "tienda 482917", "482-917-1", null, undefined]) {
      expect(normalizarCodigoTienda(q), String(q)).toBeNull();
    }
  });
});

describe("formatearCodigoTienda", () => {
  it("parte en dos para dictarlo", () => {
    expect(formatearCodigoTienda("482917")).toBe("482-917");
  });
  it("sin ID → vacío; lo raro se muestra tal cual", () => {
    expect(formatearCodigoTienda(null)).toBe("");
    expect(formatearCodigoTienda(undefined)).toBe("");
    expect(formatearCodigoTienda("12345")).toBe("12345");
  });
  it("ida y vuelta: lo que se copia se vuelve a encontrar", () => {
    expect(normalizarCodigoTienda(formatearCodigoTienda("100000"))).toBe("100000");
    expect(normalizarCodigoTienda(formatearCodigoTienda("999999"))).toBe("999999");
  });
  it("el formato es el mismo CHECK de la base (100000-999999)", () => {
    expect(CODIGO_TIENDA_RE.test("100000")).toBe(true);
    expect(CODIGO_TIENDA_RE.test("099999")).toBe(false);
  });
});

describe("tienePrefijoDeId", () => {
  it("«ID»/«#» adelante, no una palabra que empieza con «id»", () => {
    expect(tienePrefijoDeId("ID 482")).toBe(true);
    expect(tienePrefijoDeId("#482")).toBe(true);
    expect(tienePrefijoDeId("Idalia")).toBe(false);
    expect(tienePrefijoDeId("482917")).toBe(false);
  });
});

describe("buscar un negocio por su ID", () => {
  const musa = { name: "Musa", slug: "musa", codigo: "247052", ownerPhone: "+51 999 111 222" };
  // Un teléfono que CONTIENE el ID de Musa: sólo cae con dígitos sueltos.
  const otra = { name: "Bodega Otra", slug: "otra", codigo: "525146", ownerPhone: "987247052" };

  it("encuentra por el ID escrito de cualquier forma", () => {
    for (const q of ["247052", "247-052", "#247 052", "ID 247052", "id 247-052"]) {
      expect(coincideNegocio(musa, q), q).toBe(true);
    }
  });
  it("con «ID» o «#» adelante busca SÓLO por ID (no por teléfono)", () => {
    expect(coincideNegocio(otra, "ID 247052")).toBe(false);
    expect(coincideNegocio(otra, "#247-052")).toBe(false);
    // dígitos sueltos: también puede ser un pedazo de teléfono (regla de siempre)
    expect(coincideNegocio(otra, "247052")).toBe(true);
  });
  it("a medio escribir: los IDs que empiezan así (3+ dígitos)", () => {
    expect(coincideNegocio(musa, "247")).toBe(true);
    expect(coincideNegocio(musa, "ID 247")).toBe(true);
    expect(coincideNegocio(musa, "ID 24")).toBe(false);
    expect(coincideNegocio(musa, "052")).toBe(false);
  });
  it("otro ID no la encuentra", () => {
    expect(coincideNegocio(musa, "ID 525-146")).toBe(false);
    expect(coincideNegocio(musa, "525146")).toBe(false);
  });
  it("aNegocioBuscable lleva el ID que manda /api/superadmin/tenants", () => {
    expect(aNegocioBuscable({ id: "c1", name: "Musa", slug: "musa", codigo: "247052" }).codigo).toBe("247052");
    expect(aNegocioBuscable({ id: "c1", name: "Musa", slug: "musa" }).codigo).toBeNull();
  });
});
