/**
 * ADR-460 · «la página propia viste toda la tienda»: el ayudante que decide si
 * el layout de la tienda lleva el marco de una página propia, y el catálogo propio.
 *
 * · `null` (= la tienda general, el árbol de siempre) si no es tienda
 *   individual, si el negocio no existe, si no hay página propia prendida, o si
 *   su código tira o pasa el tope de 2 s (con aviso).
 * · El header `x-tenant-id` trae el SLUG: las piezas se buscan con el ID del
 *   negocio (con el slug daban 0 piezas en silencio).
 * · `marcoDeLaTienda`: sin `marco` → null; si `marco()` tira → null + aviso.
 * · `catalogoPropio`: con `?sinPiezas=1` ni llama al catálogo; si tira → null.
 */
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  tienda: { name: "Buleje Beauty", tenantId: "salon", isTenant: true },
  negocio: { id: "cuid-1", slug: "salon" } as { id: string; slug: string } | null,
  piezas: [] as unknown[],
  resolverPiezas: vi.fn(),
  reportar: vi.fn(),
}));

vi.mock("@/lib/store-metadata", () => ({ resolveStoreContext: async () => H.tienda }));
vi.mock("@/lib/tenant", () => ({ findTenantByIdOrSlug: async () => H.negocio }));
vi.mock("@/lib/extensiones/resolver", () => ({ resolverPiezas: (...a: unknown[]) => H.resolverPiezas(...a) }));
vi.mock("@/lib/extensiones/tope", async (real) => ({
  ...(await real<typeof import("@/lib/extensiones/tope")>()),
  reportarFalloPieza: (...a: unknown[]) => H.reportar(...a),
}));
vi.mock("@/lib/extensiones/BordeDePieza", () => ({
  BordeDePieza: function BordeDePieza(p: { children: ReactNode }) {
    return p.children;
  },
}));

import { marcoDeLaTienda, paginaPropiaDeLaTienda } from "@/lib/extensiones/pagina-propia-tienda";
import { catalogoPropio } from "@/lib/extensiones/CatalogoPropio";
import { RecargarSinPiezas } from "@/lib/extensiones/RecargarSinPiezas";

type Borde = ReactElement<{ piezaId: string; fallback: ReactNode; mientrasCarga: ReactNode; children: ReactNode }>;

function asignada(cargar?: () => Promise<unknown>) {
  return {
    piezaId: "pagina-salon",
    enchufe: "tienda.pagina",
    opciones: { tono: "vino" },
    version: "2.1.0",
    orden: 0,
    entrada: { manifiesto: { id: "pagina-salon" }, ...(cargar ? { pagina: cargar } : {}) },
  };
}

const Pagina = () => null;

beforeEach(() => {
  vi.clearAllMocks();
  H.tienda = { name: "Buleje Beauty", tenantId: "salon", isTenant: true };
  H.negocio = { id: "cuid-1", slug: "salon" };
  H.piezas = [];
  H.resolverPiezas.mockImplementation(async () => H.piezas);
});
afterEach(() => vi.useRealTimers());

describe("paginaPropiaDeLaTienda", () => {
  it("el marketplace (no es tienda individual) → null, sin buscar piezas", async () => {
    H.tienda = { name: "Buleje", tenantId: "main", isTenant: false };
    expect(await paginaPropiaDeLaTienda()).toBeNull();
    expect(H.resolverPiezas).not.toHaveBeenCalled();
  });

  it("negocio que no existe → null", async () => {
    H.negocio = null;
    expect(await paginaPropiaDeLaTienda()).toBeNull();
    expect(H.resolverPiezas).not.toHaveBeenCalled();
  });

  it("busca las piezas con el ID del negocio, no con el slug del header", async () => {
    await paginaPropiaDeLaTienda();
    expect(H.resolverPiezas).toHaveBeenCalledWith("cuid-1", "tienda.pagina");
  });

  it("sin página propia (o una sin código de página) → null", async () => {
    expect(await paginaPropiaDeLaTienda()).toBeNull();
    H.piezas = [asignada()];
    expect(await paginaPropiaDeLaTienda()).toBeNull();
  });

  it("con página propia → la pieza, el negocio armado acá (id + slug) y sus opciones", async () => {
    const pieza = { Pagina };
    H.piezas = [asignada(async () => pieza)];
    expect(await paginaPropiaDeLaTienda()).toEqual({
      piezaId: "pagina-salon",
      ctx: { tenantId: "cuid-1", slug: "salon", enchufe: "tienda.pagina" },
      opciones: { tono: "vino" },
      pieza,
    });
  });

  it("el código no carga (tira) → null + aviso", async () => {
    H.piezas = [
      asignada(() => {
        throw new Error("import roto");
      }),
    ];
    expect(await paginaPropiaDeLaTienda()).toBeNull();
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ piezaId: "pagina-salon", etapa: "cargar-tienda" }));
  });

  it("el código tarda más de 2 s → null + aviso", async () => {
    vi.useFakeTimers();
    H.piezas = [asignada(() => new Promise(() => {}))];
    const r = paginaPropiaDeLaTienda();
    await vi.advanceTimersByTimeAsync(2001);
    expect(await r).toBeNull();
    expect(H.reportar).toHaveBeenCalledTimes(1);
  });
});

describe("marcoDeLaTienda", () => {
  const propia = (marco?: (p: unknown) => unknown) => ({
    piezaId: "pagina-salon",
    ctx: { tenantId: "cuid-1", slug: "salon", enchufe: "tienda.pagina" as const },
    opciones: { tono: "vino" },
    pieza: { Pagina, ...(marco ? { marco } : {}) } as never,
  });

  it("sin página propia o sin `marco` → null", () => {
    expect(marcoDeLaTienda(null)).toBeNull();
    expect(marcoDeLaTienda(propia())).toBeNull();
  });

  it("arma el marco con el negocio y las opciones", () => {
    const marco = vi.fn(() => ({ tema: "t", encabezado: "e", esqueletoEncabezado: "s", pie: "p" }));
    expect(marcoDeLaTienda(propia(marco))).toEqual({ tema: "t", encabezado: "e", esqueletoEncabezado: "s", pie: "p" });
    expect(marco).toHaveBeenCalledWith({ ctx: { tenantId: "cuid-1", slug: "salon", enchufe: "tienda.pagina" }, opciones: { tono: "vino" } });
  });

  it("si `marco()` tira → null (encabezado y pie generales) + aviso", () => {
    const marco = () => {
      throw new Error("marco roto");
    };
    expect(marcoDeLaTienda(propia(marco))).toBeNull();
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ etapa: "marco" }));
  });
});

describe("catalogoPropio", () => {
  it("sin `Catalogo` → null y la búsqueda ni se espera", async () => {
    H.piezas = [asignada(async () => ({ Pagina }))];
    const busqueda = vi.fn();
    const promesa = { then: busqueda } as unknown as Promise<Record<string, string>>;
    expect(await catalogoPropio(promesa)).toBeNull();
    expect(busqueda).not.toHaveBeenCalled();
  });

  it("con `?sinPiezas=1` → null sin llamar al catálogo", async () => {
    const Catalogo = vi.fn(() => "propio");
    H.piezas = [asignada(async () => ({ Pagina, Catalogo }))];
    expect(await catalogoPropio(Promise.resolve({ sinPiezas: "1" }))).toBeNull();
    expect(Catalogo).not.toHaveBeenCalled();
  });

  it("con catálogo → dentro del borde, respaldo liviano (recargar) y la búsqueda entera", async () => {
    const Catalogo = vi.fn(() => "propio");
    H.piezas = [asignada(async () => ({ Pagina, Catalogo }))];
    const el = (await catalogoPropio(Promise.resolve({ categoria: "Shampoo" }))) as Borde;
    expect(el.props.children).toBe("propio");
    expect((el.props.fallback as ReactElement).type).toBe(RecargarSinPiezas);
    expect(el.props.mientrasCarga).toBeNull();
    expect(Catalogo).toHaveBeenCalledWith({
      ctx: { tenantId: "cuid-1", slug: "salon", enchufe: "tienda.pagina" },
      opciones: { tono: "vino" },
      searchParams: { categoria: "Shampoo" },
    });
  });

  it("si `Catalogo()` tira → null (el catálogo general) + aviso", async () => {
    const Catalogo = () => {
      throw new Error("catálogo roto");
    };
    H.piezas = [asignada(async () => ({ Pagina, Catalogo }))];
    expect(await catalogoPropio(Promise.resolve({}))).toBeNull();
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ etapa: "catalogo" }));
  });
});
