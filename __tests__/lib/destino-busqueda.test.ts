/**
 * __tests__/lib/destino-busqueda.test.ts
 *
 * ⌘K (09-10): elegir un producto, cliente o pedido abre SU ficha si esa cosa
 * ya abre por enlace (`lib/admin/enlaces-panel`); si no, su módulo. Antes los
 * resultados de /api/search (traen `tab`, no `navigateTo`) no hacían nada.
 *
 * Las aserciones de ficha se atan a la tabla (`abreLaFicha`), no a su valor de
 * hoy: cuando una pantalla prende su lector, el buscador la sigue sin tocar esto.
 */
import { describe, expect, it, vi } from "vitest";
import { destinoDelResultado, idDeLaCosa } from "@/lib/admin/destino-busqueda";
import { abreLaFicha, hrefDe } from "@/lib/admin/enlaces-panel";

describe("idDeLaCosa", () => {
  it("saca el id del prefijo que arma /api/search", () => {
    expect(idDeLaCosa({ id: "producto-12", type: "producto" })).toBe("12");
    expect(idDeLaCosa({ id: "cliente-+51 982 000 111", type: "cliente" })).toBe("+51 982 000 111");
    expect(idDeLaCosa({ id: "pedido-345", type: "pedido" })).toBe("345");
  });

  it("sin id (cliente sin teléfono) o con otro prefijo da null", () => {
    expect(idDeLaCosa({ id: "cliente-undefined", type: "cliente" })).toBeNull();
    expect(idDeLaCosa({ id: "cliente-", type: "cliente" })).toBeNull();
    expect(idDeLaCosa({ id: "modulo-inventario", type: "producto" })).toBeNull();
  });
});

describe("destinoDelResultado", () => {
  it.each([
    ["producto", "producto-12", "12", "inventario"],
    ["cliente", "cliente-982000111", "982000111", "clientes"],
    ["pedido", "pedido-345", "345", "pedidos"],
  ] as const)("%s: su ficha si ya abre; si no, su módulo", (tipo, id, idCosa, tab) => {
    const destino = destinoDelResultado({ id, type: tipo, tab });
    if (abreLaFicha(tipo)) {
      expect(destino).toEqual({ href: hrefDe(tipo, idCosa), abreFicha: true, tab: expect.any(String) });
      expect(destino?.href).toContain(encodeURIComponent(idCosa));
    } else {
      expect(destino).toEqual({ href: `/admin?tab=${tab}`, abreFicha: false, tab });
    }
  });

  it("cliente sin teléfono: al módulo, nunca a una ficha vacía", () => {
    expect(destinoDelResultado({ id: "cliente-undefined", type: "cliente", tab: "clientes" })).toEqual({
      href: "/admin?tab=clientes",
      abreFicha: false,
      tab: "clientes",
    });
  });

  it("un módulo lleva a su pestaña con vista y sub-vista", () => {
    expect(
      destinoDelResultado({ id: "sub-ctp-trozas", type: "modulo", navigateTo: "ctp-libro-operaciones", vista: "trozas" }),
    ).toEqual({ href: "/admin?tab=ctp-libro-operaciones&vista=trozas", abreFicha: false, tab: "ctp-libro-operaciones" });
  });

  it("sin módulo ni ficha no lleva a ningún lado", () => {
    expect(destinoDelResultado({ id: "accion-x", type: "accion" })).toBeNull();
  });
});

describe("con el lector prendido en la tabla", () => {
  it("producto: elegirlo abre SU ficha (y el módulo sale del href)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/admin/enlaces-panel", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/lib/admin/enlaces-panel")>();
      return {
        ...real,
        hrefDe: (cosa: string, id?: string | null) =>
          cosa === "producto" && id ? `/admin?tab=inventario&producto=${id}` : null,
      };
    });
    const { destinoDelResultado: conFicha } = await import("@/lib/admin/destino-busqueda");
    expect(conFicha({ id: "producto-12", type: "producto", tab: "productos" })).toEqual({
      href: "/admin?tab=inventario&producto=12",
      abreFicha: true,
      tab: "inventario",
    });
    vi.doUnmock("@/lib/admin/enlaces-panel");
  });
});
