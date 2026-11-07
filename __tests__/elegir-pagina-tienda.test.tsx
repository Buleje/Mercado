/**
 * ADR-511 · qué página ve la tienda de un negocio:
 * la propia prendida → la plantilla `pagina-tienda` (salvo «Clásico») → la general.
 * Y el respaldo de siempre: `?sinPiezas=1` y cualquier falla de la plantilla = la general.
 *
 * La plantilla de verdad la escriben otros carriles: acá va una de mentira con
 * la misma forma (manifiesto con Zod `.strict()` + `pagina` perezosa).
 */
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  piezas: [] as unknown[],
  resolverPiezas: vi.fn(),
  ajustes: vi.fn(),
  portada: vi.fn(),
  cargarPlantilla: vi.fn(),
  reportar: vi.fn(),
  general: vi.fn(),
  cabeceras: new Headers(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => H.cabeceras }));
vi.mock("next/server", async (real) => ({ ...(await real<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("@/lib/store-metadata", () => ({ resolveStoreContext: async () => ({ name: "Mi Pollo", tenantId: "mi-pollo", isTenant: true }) }));
vi.mock("@/lib/tenant", () => ({ findTenantByIdOrSlug: async () => ({ id: "cuid-pollo", slug: "mi-pollo" }) }));
vi.mock("@/lib/extensiones/resolver", () => ({ resolverPiezas: (...a: unknown[]) => H.resolverPiezas(...a) }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: (...a: unknown[]) => H.ajustes(...a) } }));
vi.mock("@/lib/db/store-page.db", () => ({ StorePageDB: { getCustomization: (...a: unknown[]) => H.portada(...a) } }));
vi.mock("@/extensiones/registro.servidor", async () => {
  const { z } = await import("zod");
  return {
    PIEZAS_SERVIDOR: [],
    PLANTILLA_TIENDA: {
      manifiesto: {
        id: "pagina-tienda",
        nombre: "Plantilla",
        descripcion: "x",
        version: "1.0.0",
        enchufes: ["tienda.pagina"],
        opciones: z.object({ bloques: z.array(z.string()).default(["heroe"]) }).strict(),
      },
      pagina: () => H.cargarPlantilla(),
    },
  };
});
vi.mock("@/lib/extensiones/tope", async (real) => ({
  ...(await real<typeof import("@/lib/extensiones/tope")>()),
  reportarFalloPieza: (...a: unknown[]) => H.reportar(...a),
}));
vi.mock("@/lib/extensiones/BordeDePieza", () => ({
  BordeDePieza: function BordeDePieza(p: { children: ReactNode }) {
    return p.children;
  },
}));
vi.mock("@/components/store/pagina-publica/PaginaGeneral", () => ({
  PaginaGeneral: (...a: unknown[]) => H.general(...a),
  loadPageData: async () => null,
}));
vi.mock("@/components/store/pagina-publica/datos-pagina-general", () => ({
  accesoPaginaPublica: async () => ({ datos: { tenant: { id: "cuid-pollo", slug: "mi-pollo" } } }),
  previewDe: () => false,
}));

import { elegirPaginaDeLaTienda } from "@/lib/extensiones/elegir-pagina";
import { EnchufePagina } from "@/lib/extensiones/EnchufePagina";
import { paginaPropiaDeLaTienda } from "@/lib/extensiones/pagina-propia-tienda";
import { metadatosDePaginaPropia } from "@/lib/extensiones/metadatos-pagina-propia";
import TenantLandingPage from "@/app/t/[slug]/page";

const GENERAL = <main data-general="si">la página general</main>;
const PaginaPlantilla = vi.fn(() => <p>la plantilla</p>);
type Borde = ReactElement<{ piezaId: string; children: ReactElement<{ children: string }> }>;

const propia = (id: string) => ({
  piezaId: id,
  enchufe: "tienda.pagina",
  opciones: { color: "x" },
  version: "2.0.0",
  orden: 0,
  entrada: { manifiesto: { id }, pagina: async () => ({ Pagina: () => <p>la propia</p> }) },
});
const conTema = (tiendaPlantilla?: unknown) => H.ajustes.mockResolvedValue({ businessName: "Mi Pollo", storeTheme: tiendaPlantilla === undefined ? {} : { tiendaPlantilla } });

beforeEach(() => {
  vi.clearAllMocks();
  H.piezas = [];
  H.resolverPiezas.mockImplementation(async () => H.piezas);
  conTema();
  H.portada.mockResolvedValue(null);
  H.cargarPlantilla.mockResolvedValue({ Pagina: PaginaPlantilla });
  H.general.mockReturnValue(GENERAL);
  H.cabeceras = new Headers({ host: "localhost:3000", "x-forwarded-host": "mercado-hazel.vercel.app", "x-forwarded-proto": "https", "x-tenant-store-route": "1" });
});
afterEach(() => vi.useRealTimers());

describe("elegirPaginaDeLaTienda — el orden", () => {
  it("la propia prendida gana y ni se leen los ajustes", async () => {
    H.piezas = [propia("pagina-musa")];
    const e = await elegirPaginaDeLaTienda("cuid-musa");
    expect(e).toMatchObject({ piezaId: "pagina-musa", origen: "propia", opciones: { color: "x" } });
    expect(H.ajustes).not.toHaveBeenCalled();
  });

  it("sin propia y sin elección del dueño → la plantilla, con las opciones por defecto de su Zod", async () => {
    const e = await elegirPaginaDeLaTienda("cuid-pollo");
    expect(e).toMatchObject({ piezaId: "pagina-tienda", origen: "plantilla", opciones: { bloques: ["heroe"] } });
    expect(H.ajustes).toHaveBeenCalledWith("cuid-pollo");
  });

  it("con una pieza de `tienda.portada` prendida → null (sólo la general la dibuja)", async () => {
    H.resolverPiezas.mockImplementation(async (_t: unknown, enchufe: unknown) =>
      enchufe === "tienda.portada" ? [{ ...propia("madera-disponible"), entrada: { manifiesto: { id: "madera-disponible" }, portada: async () => () => null } }] : [],
    );
    expect(await elegirPaginaDeLaTienda("cuid-pollo")).toBeNull();
  });

  it("una pieza del enchufe sin código no tapa a la plantilla", async () => {
    H.piezas = [{ ...propia("sin-codigo"), entrada: { manifiesto: { id: "sin-codigo" } } }];
    expect((await elegirPaginaDeLaTienda("cuid-pollo"))?.origen).toBe("plantilla");
  });

  it("«Clásico» → null (la general); pedidos por WhatsApp sigue en la plantilla", async () => {
    conTema({ formato: "clasico" });
    expect(await elegirPaginaDeLaTienda("cuid-pollo")).toBeNull();
    conTema({ formato: "tienda", pedido: "whatsapp" });
    expect((await elegirPaginaDeLaTienda("cuid-pollo"))?.origen).toBe("plantilla");
  });

  it("un valor guardado roto no saca a nadie de la plantilla (leerPlantilla con safeParse)", async () => {
    conTema({ formato: "otro" });
    expect((await elegirPaginaDeLaTienda("cuid-pollo"))?.origen).toBe("plantilla");
  });

  it("si no se pueden leer los ajustes → la general y aviso (no se le cambia la tienda a ciegas)", async () => {
    H.ajustes.mockRejectedValue(new Error("pooler caído"));
    expect(await elegirPaginaDeLaTienda("cuid-pollo")).toBeNull();
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ piezaId: "pagina-tienda", etapa: "plantilla-ajustes", tenantId: "cuid-pollo" }));
  });
});

describe("EnchufePagina con la plantilla", () => {
  const props = { nombre: "tienda.pagina" as const, tenantId: "cuid-pollo", slug: "mi-pollo", fallback: GENERAL, searchParams: { q: "pollo" } };

  it("dibuja la plantilla dentro del borde, con el negocio y la búsqueda", async () => {
    const el = (await EnchufePagina(props)) as Borde;
    expect(el.props.piezaId).toBe("pagina-tienda");
    expect(el.props.children.props.children).toBe("la plantilla");
    expect(PaginaPlantilla).toHaveBeenCalledWith({
      ctx: { tenantId: "cuid-pollo", slug: "mi-pollo", enchufe: "tienda.pagina" },
      opciones: { bloques: ["heroe"] },
      searchParams: { q: "pollo" },
    });
  });

  it("si el código de la plantilla tira → la general, el MISMO objeto, y aviso", async () => {
    H.cargarPlantilla.mockRejectedValue(new Error("chunk roto"));
    expect(await EnchufePagina(props)).toBe(GENERAL);
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ piezaId: "pagina-tienda", etapa: "pagina" }));
  });

  it("si su Pagina tira al armarse → la general", async () => {
    H.cargarPlantilla.mockResolvedValue({ Pagina: () => { throw new Error("datos raros"); } });
    expect(await EnchufePagina(props)).toBe(GENERAL);
  });

  it("«Clásico» → la general directo, sin cargar el código de la plantilla", async () => {
    conTema({ formato: "clasico" });
    expect(await EnchufePagina(props)).toBe(GENERAL);
    expect(H.cargarPlantilla).not.toHaveBeenCalled();
  });
});

describe("el resto de la tienda (marco, catálogo, ficha) ve la misma elección", () => {
  it("paginaPropiaDeLaTienda dice origen «plantilla»; con propia, «propia»", async () => {
    expect((await paginaPropiaDeLaTienda())?.origen).toBe("plantilla");
    H.piezas = [propia("pagina-musa")];
    expect(await paginaPropiaDeLaTienda()).toMatchObject({ origen: "propia", piezaId: "pagina-musa" });
  });
});

describe("la ruta /t/<negocio>", () => {
  const contenido = async (busqueda: Record<string, string>) => {
    const shell = TenantLandingPage({ params: Promise.resolve({ slug: "mi-pollo" }), searchParams: Promise.resolve(busqueda) }) as ReactElement<{ children: ReactElement }>;
    const hijo = shell.props.children;
    return (hijo.type as (p: unknown) => Promise<ReactNode>)(hijo.props);
  };

  it("`?sinPiezas=1` → la general pura, sin preguntar qué página toca", async () => {
    expect(await contenido({ sinPiezas: "1" })).toBe(GENERAL);
    expect(H.resolverPiezas).not.toHaveBeenCalled();
    expect(H.cargarPlantilla).not.toHaveBeenCalled();
  });

  it("sin «Clásico» → el enchufe (con la general de respaldo); con «Clásico» → la general", async () => {
    const el = (await contenido({})) as ReactElement<{ tenantId: string; fallback: ReactElement }>;
    expect(el.props.tenantId).toBe("cuid-pollo");
    expect(el.props.fallback.props).toMatchObject({ slug: "mi-pollo" });
    conTema({ formato: "clasico" });
    expect(await contenido({})).toBe(GENERAL);
  });
});

describe("metadatos de la plantilla (sin metadatosPagina propios)", () => {
  it("nombre del negocio, canónica e imagen con el dominio de la petición, ícono = su logo", async () => {
    H.ajustes.mockResolvedValue({ businessName: "Mi Pollo", logoUrl: "https://cdn.supabase.co/logo.png", storeTheme: {} });
    const m = await metadatosDePaginaPropia("portada", {});
    expect(m?.title).toEqual({ absolute: "Mi Pollo" });
    expect(m?.alternates?.canonical).toBe("https://mercado-hazel.vercel.app/t/mi-pollo");
    expect(m?.openGraph).toMatchObject({
      siteName: "Mi Pollo",
      images: [{ url: "https://mercado-hazel.vercel.app/api/og?title=Mi%20Pollo&subtitle=Pide%20online%20con%20delivery", width: 1200, height: 630 }],
    });
    expect(JSON.stringify(m?.icons)).toContain("https://cdn.supabase.co/logo.png");
    expect(JSON.stringify(m)).not.toContain("buleje.pe");
  });

  it("la cadena de la imagen: ogImageUrl → heroImageUrl; una `data:` se salta; el catálogo lleva «— Catálogo»", async () => {
    H.portada.mockResolvedValue({ ogImageUrl: "data:image/png;base64,AAA", heroImageUrl: "/uploads/portada.jpg", metaTitle: "Pollos a la brasa" });
    const m = await metadatosDePaginaPropia("catalogo", {});
    expect(m?.title).toEqual({ absolute: "Mi Pollo — Catálogo" });
    expect(m?.alternates?.canonical).toBe("https://mercado-hazel.vercel.app/t/mi-pollo/tienda");
    expect(m?.openGraph).toMatchObject({ images: [{ url: "https://mercado-hazel.vercel.app/uploads/portada.jpg" }] });
    H.portada.mockResolvedValue({ ogImageUrl: "https://img.example/og.jpg", heroImageUrl: "/uploads/portada.jpg" });
    expect((await metadatosDePaginaPropia("portada", {}))?.openGraph).toMatchObject({ images: [{ url: "https://img.example/og.jpg" }] });
  });

  it("si la plantilla trae sus propios metadatos, mandan los suyos", async () => {
    H.cargarPlantilla.mockResolvedValue({ Pagina: PaginaPlantilla, metadatosPagina: async () => ({ sitio: "X", titulo: "Suyo", descripcion: "d" }) });
    expect((await metadatosDePaginaPropia("portada", {}))?.title).toEqual({ absolute: "Suyo" });
    expect(H.portada).not.toHaveBeenCalled();
  });

  it("«Clásico» → undefined (los metadatos de la general)", async () => {
    conTema({ formato: "clasico" });
    expect(await metadatosDePaginaPropia("portada", {})).toBeUndefined();
  });
});
