import { describe, it, expect } from "vitest";
import { coincideNegocio, normalizarTelefono, aNegocioBuscable } from "@/lib/superadmin/buscar-negocio";

const clave = {
  name: "Tienda Clave Propia",
  slug: "tienda-clave-propia",
  ownerEmail: "dueno@clave.pe",
  ownerPhone: "+51987654321",
  businessPhone: "061 57 1234",
  ruc: "20601234567",
};

describe("normalizarTelefono", () => {
  it("quita +51, 0051, espacios y guiones", () => {
    expect(normalizarTelefono("+51 987-654-321")).toBe("987654321");
    expect(normalizarTelefono("0051 987654321")).toBe("987654321");
    expect(normalizarTelefono("987 654 321")).toBe("987654321");
  });
  it("no recorta un número que sólo empieza con 51", () => {
    expect(normalizarTelefono("51234")).toBe("51234");
  });
});

describe("coincideNegocio", () => {
  it("encuentra por teléfono escrito de cualquier forma", () => {
    for (const q of ["+51 987-654-321", "987 654 321", "987654321", "654-321", "0051987654321"]) {
      expect(coincideNegocio(clave, q)).toBe(true);
    }
  });
  it("encuentra por el teléfono del negocio y por RUC", () => {
    expect(coincideNegocio(clave, "57 1234")).toBe(true);
    expect(coincideNegocio(clave, "20601234567")).toBe(true);
    expect(coincideNegocio(clave, "2060123")).toBe(true);
  });
  it("sigue buscando por nombre (sin tildes), código y correo", () => {
    expect(coincideNegocio(clave, "clave")).toBe(true);
    expect(coincideNegocio({ ...clave, name: "Pollería Ñaña" }, "polleria")).toBe(true);
    expect(coincideNegocio(clave, "tienda-clave")).toBe(true);
    expect(coincideNegocio(clave, "dueno@")).toBe(true);
  });
  it("no busca números con 1-2 dígitos ni cuando lo escrito trae letras", () => {
    expect(coincideNegocio(clave, "98")).toBe(false);
    expect(coincideNegocio(clave, "tienda 987")).toBe(false);
    expect(coincideNegocio(clave, "111 222 333")).toBe(false);
  });
  it("vacío = todos", () => {
    expect(coincideNegocio(clave, "  ")).toBe(true);
  });
});

describe("aNegocioBuscable", () => {
  it("toma lo que manda /api/superadmin/tenants", () => {
    const n = aNegocioBuscable({ id: "c1", name: "Blas", slug: "blas", ownerPhone: "", ruc: "20" });
    expect(n).toMatchObject({ id: "c1", name: "Blas", slug: "blas", ownerPhone: null, ruc: "20" });
  });
});
