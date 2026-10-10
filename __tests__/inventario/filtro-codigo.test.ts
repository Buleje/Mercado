import { describe, expect, it } from "vitest";
import { coincideBusqueda } from "@/components/admin/inventario/inventario-compartido";

/**
 * El escáner del Inventario pasa el código tal cual a la búsqueda. Antes el
 * filtro bajaba a minúsculas sólo lo buscado y no el código guardado: los 27
 * códigos con letras (todos de Musa, p. ej. `MU003`) no aparecían nunca.
 */
describe("búsqueda del Inventario por código", () => {
  const productos = [
    { name: "Sérum de vitamina C", barcode: "MU003" },
    { name: "Arroz Costeño 5 kg", barcode: "7751271012345" },
    { name: "Sin código", barcode: null },
  ];

  it("el código escaneado con mayúsculas encuentra su producto", () => {
    expect(productos.filter((p) => coincideBusqueda(p, "MU003"))).toHaveLength(1);
  });

  it("escrito en minúsculas también lo encuentra", () => {
    expect(productos.filter((p) => coincideBusqueda(p, "mu003")).map((p) => p.barcode)).toEqual(["MU003"]);
  });

  it("el nombre sigue sin distinguir mayúsculas y la búsqueda vacía deja todo", () => {
    expect(productos.filter((p) => coincideBusqueda(p, "ARROZ"))).toHaveLength(1);
    expect(productos.filter((p) => coincideBusqueda(p, "  "))).toHaveLength(3);
  });

  it("un código numérico se encuentra por parte", () => {
    expect(productos.filter((p) => coincideBusqueda(p, "775127"))).toHaveLength(1);
  });
});
