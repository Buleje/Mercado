/**
 * Lo que se ve al COMPARTIR la portada y el catálogo de una página propia
 * (`lib/extensiones/metadatos-pagina-propia.ts`, enchufe `metadatosPagina`).
 * · Sin página propia o sin `metadatosPagina` → undefined: la ruta usa los suyos (las demás tiendas no cambian).
 * · Las URL salen con el dominio de la PETICIÓN (buleje.pe no existe: la tarjeta salía sin imagen).
 * · `/t/<negocio>` por ruta; por dominio propio, la raíz. `alternates` entero (pisa el del layout).
 * · Si la pieza tira → undefined y se avisa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  piezas: [] as unknown[],
  reportar: vi.fn(),
  cabeceras: new Headers(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => H.cabeceras }));
vi.mock("@/lib/store-metadata", () => ({ resolveStoreContext: async () => ({ name: "Musa", tenantId: "musa", isTenant: true }) }));
vi.mock("@/lib/tenant", () => ({ findTenantByIdOrSlug: async () => ({ id: "cuid-musa", slug: "musa" }) }));
vi.mock("@/lib/extensiones/resolver", () => ({ resolverPiezas: async () => H.piezas }));
vi.mock("@/lib/extensiones/tope", async (real) => ({
  ...(await real<typeof import("@/lib/extensiones/tope")>()),
  reportarFalloPieza: (...a: unknown[]) => H.reportar(...a),
}));

import { metadatosDePaginaPropia } from "@/lib/extensiones/metadatos-pagina-propia";

const conPieza = (pieza: Record<string, unknown>) => {
  H.piezas = [
    { piezaId: "pagina-musa", enchufe: "tienda.pagina", opciones: {}, version: "2.0.0", orden: 0, entrada: { manifiesto: { id: "pagina-musa" }, pagina: async () => ({ Pagina: () => null, ...pieza }) } },
  ];
};
const META = {
  sitio: "Musa",
  titulo: "Musa — Belleza profesional, cerca de ti",
  descripcion: "Cabello, rostro y cuerpo.",
  imagen: { ruta: "/musa/og.jpg", ancho: 1200, alto: 630, alt: "Musa" },
};

beforeEach(() => {
  H.piezas = [];
  H.reportar.mockReset();
  H.cabeceras = new Headers({ host: "localhost:3000", "x-forwarded-host": "mercado-hazel.vercel.app", "x-forwarded-proto": "https", "x-tenant-store-route": "1" });
});
afterEach(() => vi.clearAllMocks());

describe("metadatosDePaginaPropia", () => {
  it("sin página propia o sin `metadatosPagina` → undefined (los de siempre)", async () => {
    expect(await metadatosDePaginaPropia("catalogo", {})).toBeUndefined();
    conPieza({});
    expect(await metadatosDePaginaPropia("catalogo", {})).toBeUndefined();
  });

  it("arma canónica, og:url y og:image con el dominio de la petición", async () => {
    const metadatosPagina = vi.fn(async () => META);
    conPieza({ metadatosPagina });
    const m = await metadatosDePaginaPropia("catalogo", Promise.resolve({ q: "x" }));
    expect(metadatosPagina).toHaveBeenCalledWith(expect.objectContaining({ vista: "catalogo", searchParams: { q: "x" } }));
    expect(m?.title).toEqual({ absolute: META.titulo });
    expect(m?.alternates).toEqual({
      canonical: "https://mercado-hazel.vercel.app/t/musa/tienda",
      languages: { "es-PE": "https://mercado-hazel.vercel.app/t/musa/tienda", "x-default": "https://mercado-hazel.vercel.app/t/musa/tienda" },
    });
    expect(m?.openGraph).toMatchObject({ url: "https://mercado-hazel.vercel.app/t/musa/tienda", siteName: "Musa", images: [{ url: "https://mercado-hazel.vercel.app/musa/og.jpg", width: 1200, height: 630 }] });
    expect(JSON.stringify(m)).not.toContain("buleje.pe");
  });

  it("portada por dominio propio = la raíz; la consulta de la pieza entra en la canónica", async () => {
    H.cabeceras = new Headers({ host: "musa.pe" });
    conPieza({ metadatosPagina: async () => META });
    expect((await metadatosDePaginaPropia("portada", {}))?.alternates?.canonical).toBe("https://musa.pe/");
    conPieza({ metadatosPagina: async () => ({ ...META, consulta: "?categoria=Rostro" }) });
    expect((await metadatosDePaginaPropia("catalogo", {}))?.alternates?.canonical).toBe("https://musa.pe/tienda?categoria=Rostro");
  });

  it("un host raro no entra: cae a NEXT_PUBLIC_BASE_URL", async () => {
    H.cabeceras = new Headers({ host: "evil.com/<script>" });
    conPieza({ metadatosPagina: async () => META });
    const m = await metadatosDePaginaPropia("portada", {});
    expect(String(m?.alternates?.canonical)).not.toContain("evil");
  });

  it("si la pieza tira → undefined y se avisa; `?sinPiezas=1` ni la llama", async () => {
    conPieza({ metadatosPagina: async () => { throw new Error("se rompió"); } });
    expect(await metadatosDePaginaPropia("catalogo", {})).toBeUndefined();
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ piezaId: "pagina-musa", etapa: "pagina-metadatos" }));
    const metadatosPagina = vi.fn(async () => META);
    conPieza({ metadatosPagina });
    expect(await metadatosDePaginaPropia("catalogo", { sinPiezas: "1" })).toBeUndefined();
    expect(metadatosPagina).not.toHaveBeenCalled();
  });
});
