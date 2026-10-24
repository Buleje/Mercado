import { describe, expect, it } from "vitest";
import { nivelDeNombre, searchModules } from "@/components/admin/buscador/indice-modulos";

/** Los nombres salen del registro real (ALL_TABS + subvistas), no se copian a mano. */
describe("orden del buscador: gana el nombre que coincide", () => {
  it("«pedidos» → primero el módulo Pedidos y reparto, no Campañas", () => {
    const r = searchModules("pedidos");
    expect(r[0].title).toBe("Pedidos y reparto");
    expect(r.findIndex((x) => /bodega al mes/i.test(x.title))).not.toBe(0);
  });

  it("«venta» → lo primero lleva «venta» en el nombre", () => {
    const r = searchModules("venta");
    expect(r[0].title).toBe("Ventas & Caja");
  });

  it("«caja» → el módulo con «caja» en el nombre va primero y los sinónimos al final", () => {
    const r = searchModules("caja");
    expect(r[0].title).toBe("Ventas & Caja");
    const primerSinNombre = r.findIndex((x) => nivelDeNombre(x.title, "caja") === 0);
    if (primerSinNombre >= 0) {
      expect(r.slice(primerSinNombre).every((x) => nivelDeNombre(x.title, "caja") === 0)).toBe(true);
    }
  });

  it("«clientes» → el módulo Mis Clientes o uno con «clientes» en el nombre primero", () => {
    const r = searchModules("clientes");
    expect(r[0].title).toBe("Mis Clientes");
  });

  it("niveles: exacto > empieza > palabra > contiene > nada", () => {
    expect(nivelDeNombre("Caja", "caja")).toBe(4);
    expect(nivelDeNombre("Caja chica", "caja")).toBe(3);
    expect(nivelDeNombre("Turnos de Caja", "caja")).toBe(2);
    expect(nivelDeNombre("Cajas", "caja")).toBe(3);
    expect(nivelDeNombre("Encajado", "caja")).toBe(1);
    expect(nivelDeNombre("Bodega al Mes", "pedidos")).toBe(0);
  });
});
