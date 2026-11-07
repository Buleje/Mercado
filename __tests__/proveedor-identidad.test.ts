import { describe, expect, it } from "vitest";
import {
  avisoDeDocumento,
  coincidenciasDeProveedor,
  describirCoincidencia,
  duplicadosEnLista,
  errorDeDocumento,
  hayMismoDocumento,
  nombreNormalizado,
  proveedorCoincideBusqueda,
  telefonoNormalizado,
  type ProveedorParaCruce,
} from "@/lib/compras/proveedor-identidad";

/** C34: el mismo proveedor escrito de otra forma se avisa; nunca se une solo. */
describe("documento del proveedor", () => {
  it("RUC 11 dígitos, DNI 8; vacío vale (es opcional)", () => {
    expect(errorDeDocumento("RUC", "20100047218")).toBeNull();
    expect(errorDeDocumento("RUC", "2010004721")).toMatch(/11 dígitos/);
    expect(errorDeDocumento("DNI", "45678901")).toBeNull();
    expect(errorDeDocumento("DNI", "4567890")).toMatch(/8 dígitos/);
    expect(errorDeDocumento("RUC", "")).toBeNull();
    // Sin tipo declarado se valida como RUC (el default del formulario).
    expect(errorDeDocumento(null, "123")).toMatch(/RUC/);
  });

  it("dígito verificador del RUC: avisa, no bloquea", () => {
    expect(avisoDeDocumento("RUC", "20100047218")).toBeNull();
    expect(avisoDeDocumento("RUC", "20601234567")).toMatch(/no cuadra/);
    expect(errorDeDocumento("RUC", "20601234567")).toBeNull();
  });
});

describe("normalizar para comparar", () => {
  it("quita forma societaria, puntos y tildes, pero deja al menos una palabra", () => {
    expect(nombreNormalizado("Distribuidora Ucayali S.A.C.")).toBe("distribuidora ucayali");
    expect(nombreNormalizado("DISTRIBUIDORA UCAYALI SAC")).toBe("distribuidora ucayali");
    expect(nombreNormalizado("Café Peñaloza E.I.R.L.")).toBe("cafe penaloza");
    expect(nombreNormalizado("Empresa")).toBe("empresa");
  });

  it("teléfono: 9 dígitos sin +51; menos de 6 no identifica", () => {
    expect(telefonoNormalizado("+51 987 654 321")).toBe("987654321");
    expect(telefonoNormalizado("123")).toBeNull();
  });
});

const lista: ProveedorParaCruce[] = [
  { id: "a", name: "Distribuidora Ucayali S.A.C.", tipoDocumento: "RUC", documento: "20100047218", phone: "987654321" },
  { id: "b", name: "DISTRIBUIDORA UCAYALI SAC", phone: "+51 987 654 321" },
  { id: "c", name: "Bodega Rosita", tipoDocumento: "DNI", documento: "45678901" },
  { id: "d", name: "Rosita", ruc: "10456789011" },
  { id: "e", name: "JJ" },
  { id: "f", name: "JJ" },
];

describe("coincidencias", () => {
  it("el mismo documento va primero y es el que frena el alta", () => {
    const c = coincidenciasDeProveedor({ name: "Otro nombre", documento: "20100047218" }, lista);
    expect(c[0]).toMatchObject({ id: "a", motivos: ["documento"] });
    expect(hayMismoDocumento(c)?.id).toBe("a");
  });

  it("nombre y teléfono parecidos avisan sin ser «mismo documento»", () => {
    const c = coincidenciasDeProveedor({ name: "Distribuidora Ucayali", phone: "987-654-321" }, lista);
    expect(c.map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect(hayMismoDocumento(c)).toBeNull();
    expect(describirCoincidencia(c[0])).toMatch(/mismo nombre y teléfono/);
  });

  it("el RUC 10 lleva el DNI adentro", () => {
    const c = coincidenciasDeProveedor({ name: "X", tipoDocumento: "DNI", documento: "45678901" }, lista, "c");
    expect(c.map((x) => x.id)).toEqual(["d"]);
  });

  it("al editar no se compara consigo mismo", () => {
    expect(coincidenciasDeProveedor({ id: "c", name: "Bodega Rosita", documento: "45678901" }, lista)).toEqual(
      [expect.objectContaining({ id: "d" })],
    );
  });

  it("nombres de menos de 4 letras no unen a nadie", () => {
    const dup = duplicadosEnLista(lista);
    expect(dup.has("e")).toBe(false);
    expect(dup.get("a")?.map((x) => x.id)).toEqual(["b"]);
    expect(dup.get("c")?.map((x) => x.id)).toEqual(["d"]);
  });
});

describe("buscador", () => {
  it("encuentra por nombre sin tildes, por RUC con guiones y por celular con espacios", () => {
    const p = { name: "Panadería Ucayali", documento: "20100047218", phone: "987654321" };
    expect(proveedorCoincideBusqueda(p, "panaderia")).toBe(true);
    expect(proveedorCoincideBusqueda(p, "20-100")).toBe(true);
    expect(proveedorCoincideBusqueda(p, "987 654")).toBe(true);
    expect(proveedorCoincideBusqueda(p, "12")).toBe(false);
  });
});
