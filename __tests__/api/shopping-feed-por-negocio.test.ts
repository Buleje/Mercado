/**
 * Feed de productos por negocio (`/api/shopping-feed`) y sus hermanos
 * (`/api/store-page/public-catalog`, `/api/products/share`).
 *
 * Antes el feed hacía `product.findMany({ where: { active: true } })` sin
 * `tenantId`: publicaba los productos de TODOS los negocios con la marca
 * «Buleje». Acá la base es un mock que SOLO filtra por lo que trae el WHERE:
 * si el WHERE no llevara `tenantId`, el feed de un negocio traería los
 * productos del otro y estos tests caen.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionPayload: vi.fn(async () => null) }));
vi.mock("@/lib/middleware/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/middleware/constants")>()),
  ROOT_DOMAIN: "buleje.test",
}));

type Fila = {
  id: number;
  tenantId: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  costPrice: number;
  image: string;
  description: string | null;
  brand: string | null;
  barcode: string | null;
  badge: string | null;
  stock: number | null;
  active: boolean;
  deletedAt: Date | null;
};

const h = vi.hoisted(() => ({
  productos: [] as Array<Record<string, unknown>>,
  ocultos: [] as Array<{ tenantId: string; productId: number }>,
  imagenes: [] as Array<{ tenantId: string; productId: number; url: string; position: number }>,
  negocios: {} as Record<string, { id: string; slug: string; name: string; customDomain: string | null; active: boolean }>,
  publicado: {} as Record<string, boolean>,
  idPorCrudo: {} as Record<string, string>,
}));

/** El mock de la base filtra SOLO por el WHERE que recibe: sin tenantId no hay aislamiento. */
function cumple(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => fila[k] === v);
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select: Record<string, unknown> }) =>
        h.productos
          .filter((p) => cumple(p, where))
          .sort((a, b) => (a.id as number) - (b.id as number))
          .map((p) => {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(select)) if (k !== "images") out[k] = p[k];
            if (select.images) {
              const imgWhere = (select.images as { where: Record<string, unknown> }).where;
              out.images = h.imagenes
                .filter((i) => i.productId === p.id && cumple(i, imgWhere))
                .sort((a, b) => a.position - b.position)
                .map((i) => ({ url: i.url }));
            }
            return out;
          }),
      ),
      findFirst: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
        const p = h.productos.find((x) => cumple(x, where));
        if (!p) return null;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) out[k] = p[k];
        return out;
      }),
    },
    tenantPageProductOverride: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) =>
        h.ocultos.filter((o) => o.tenantId === where.tenantId).map((o) => ({ productId: o.productId })),
      ),
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; productId: number } }) =>
        h.ocultos.some((o) => o.tenantId === where.tenantId && o.productId === where.productId) ? { id: "x" } : null,
      ),
    },
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.negocios[where.id] ?? null),
    },
  },
}));

vi.mock("@/lib/resolve-tenant", () => ({
  tenantIdPublico: vi.fn(async (crudo: string | null) => (crudo ? h.idPorCrudo[crudo] ?? null : null)),
}));
vi.mock("@/lib/db/settings.db", () => ({
  SettingsDB: { get: vi.fn(async (id: string) => (id === "t-musa" ? { storeTheme: { storeName: "Musa Belleza" } } : {})) },
}));
vi.mock("@/lib/db/store-page.db", () => ({
  StorePageDB: { getCustomization: vi.fn(async (id: string) => ({ published: h.publicado[id] ?? true })) },
}));

import { GET as feed } from "@/app/api/shopping-feed/route";
import { GET as catalogo } from "@/app/api/store-page/public-catalog/route";
import { GET as compartir } from "@/app/api/products/share/route";
import { gtinValido, armarFeedXml, type ProductoDelFeed } from "@/lib/tienda-publica/feed-productos";

function fila(p: Partial<Fila> & Pick<Fila, "id" | "tenantId" | "name">): Fila {
  return {
    category: "General",
    unit: "und",
    price: 10,
    costPrice: 4.37,
    image: "",
    description: null,
    brand: null,
    barcode: null,
    badge: null,
    stock: null,
    active: true,
    deletedAt: null,
    ...p,
  };
}

function req(url: string, headers: Record<string, string> = {}): NextRequest {
  const u = new URL(url);
  return new NextRequest(u, { headers: { host: u.host, ...headers } });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BASE_URL = "https://www.buleje.test";
  h.negocios = {
    "t-musa": { id: "t-musa", slug: "musa", name: "Musa SAC", customDomain: null, active: true },
    "t-bodega": { id: "t-bodega", slug: "bodega", name: "Bodega Rosa", customDomain: "www.bodegarosa.pe", active: true },
    main: { id: "main", slug: "main", name: "Buleje", customDomain: null, active: true },
  };
  h.idPorCrudo = { musa: "t-musa", bodega: "t-bodega", "custom--www.bodegarosa.pe": "t-bodega", main: "main" };
  h.publicado = {};
  h.productos = [
    fila({ id: 1, tenantId: "t-musa", name: "Sérum Vitamina C", price: 59.9, image: "/uploads/serum.png", stock: 98765, barcode: "4006381333931" }),
    fila({ id: 2, tenantId: "t-musa", name: "Crema oculta", price: 20 }),
    fila({ id: 3, tenantId: "t-musa", name: "Labial apagado", active: false }),
    fila({ id: 4, tenantId: "t-bodega", name: "Arroz Costeño 5 kg", price: 24.5, image: "https://cdn.x/arroz.jpg", stock: 0, brand: "Costeño" }),
    fila({ id: 5, tenantId: "main", name: "Gaseosa <Inca> & Kola", price: 3.5 }),
  ];
  h.ocultos = [{ tenantId: "t-musa", productId: 2 }];
  h.imagenes = [
    { tenantId: "t-musa", productId: 1, url: "/uploads/serum-2.png", position: 1 },
    { tenantId: "t-bodega", productId: 1, url: "https://ajeno/robada.png", position: 0 },
  ];
});

describe("GET /api/shopping-feed — un negocio por feed", () => {
  it("por subdominio: solo los productos de ese negocio, con su nombre y su dirección", async () => {
    const res = await feed(req("https://musa.buleje.test/api/shopping-feed"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await res.text();

    expect(xml).toContain("<g:title>Sérum Vitamina C</g:title>");
    expect(xml).not.toContain("Arroz"); // de otro negocio
    expect(xml).not.toContain("Gaseosa"); // del negocio por defecto
    expect(xml).not.toContain("Crema oculta"); // oculto en la página de la tienda
    expect(xml).not.toContain("Labial apagado"); // inactivo
    expect(xml).not.toContain("robada.png"); // imagen con tenantId ajeno
    expect(xml).toContain("<title>Musa Belleza</title>");
    expect(xml).toContain("<g:brand>Musa Belleza</g:brand>");
    expect(xml).not.toContain("Buleje");
    expect(xml).toContain("<g:link>https://musa.buleje.test/tienda/serum-vitamina-c</g:link>");
    expect(xml).toContain("<g:image_link>https://musa.buleje.test/uploads/serum.png</g:image_link>");
    expect(xml).toContain("<g:additional_image_link>https://musa.buleje.test/uploads/serum-2.png</g:additional_image_link>");
    expect(xml).toContain("<g:gtin>4006381333931</g:gtin>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    // Sin costo ni cantidad en stock.
    expect(xml).not.toContain("4.37");
    expect(xml).not.toContain("98765");
  });

  it("por ?tienda=<slug>: el de esa tienda, con enlaces a su dominio propio", async () => {
    const res = await feed(req("https://www.buleje.test/api/shopping-feed?tienda=bodega"));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("<g:title>Arroz Costeño 5 kg</g:title>");
    expect(xml).not.toContain("Sérum");
    expect(xml).toContain("<g:link>https://www.bodegarosa.pe/tienda/arroz-costeno-5-kg</g:link>");
    expect(xml).toContain("<g:brand>Costeño</g:brand>");
    expect(xml).toContain("<g:availability>out_of_stock</g:availability>");
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });

  it("por dominio propio: el negocio dueño del dominio", async () => {
    const res = await feed(req("https://www.bodegarosa.pe/api/shopping-feed"));
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(xml).toContain("Arroz Costeño");
    expect(xml).not.toContain("Sérum");
  });

  it("la dirección principal publica el negocio por defecto, escapado", async () => {
    const res = await feed(req("https://www.buleje.test/api/shopping-feed"));
    const xml = await res.text();
    expect(xml).toContain("<g:title>Gaseosa &lt;Inca&gt; &amp; Kola</g:title>");
    expect(xml).toContain("<g:link>https://www.buleje.test/tienda/gaseosa-inca-kola</g:link>");
    expect(xml).not.toContain("Arroz");
    expect(xml).not.toContain("Sérum");
  });

  it("una sesión de admin no cambia el negocio del feed (cacheable por URL)", async () => {
    const res = await feed(req("https://www.buleje.test/api/shopping-feed", { "x-tenant-id": "t-musa" }));
    const xml = await res.text();
    expect(xml).toContain("Gaseosa");
    expect(xml).not.toContain("Sérum");
  });

  it("negocio inexistente → 404", async () => {
    expect((await feed(req("https://www.buleje.test/api/shopping-feed?tienda=no-existe"))).status).toBe(404);
    expect((await feed(req("https://otra.buleje.test/api/shopping-feed"))).status).toBe(404);
  });

  it("página de la tienda despublicada o negocio dado de baja → 404", async () => {
    h.publicado["t-musa"] = false;
    expect((await feed(req("https://musa.buleje.test/api/shopping-feed"))).status).toBe(404);
    h.negocios["t-bodega"].active = false;
    expect((await feed(req("https://www.buleje.test/api/shopping-feed?tienda=bodega"))).status).toBe(404);
  });

  it("?tienda= mal formado o dominio sintético → 400", async () => {
    expect((await feed(req("https://www.buleje.test/api/shopping-feed?tienda=custom--www.bodegarosa.pe"))).status).toBe(400);
    expect((await feed(req("https://www.buleje.test/api/shopping-feed?tienda=a%20b"))).status).toBe(400);
  });
});

describe("hermanos: catálogo público y enlace para compartir", () => {
  it("public-catalog: solo el negocio de x-tenant-id, sin stock ni costo", async () => {
    const res = await catalogo(req("https://www.buleje.test/api/store-page/public-catalog", { "x-tenant-id": "musa" }));
    const lista = (await res.json()) as Array<Record<string, unknown>>;
    expect(lista.map((p) => p.productId)).toEqual([1]);
    expect(lista[0]).not.toHaveProperty("stock");
    expect(lista[0]).not.toHaveProperty("costPrice");
    expect(lista[0].disponible).toBe(true);
  });

  it("share: un producto de otro negocio da 404 y el enlace es de la tienda propia", async () => {
    const ajeno = await compartir(req("https://www.buleje.test/api/products/share?id=4", { "x-tenant-id": "musa" }));
    expect(ajeno.status).toBe(404);
    const propio = await compartir(req("https://www.buleje.test/api/products/share?id=1", { "x-tenant-id": "musa" }));
    const body = (await propio.json()) as { product: { url: string }; share: { text: string } };
    expect(body.product.url).toBe("https://musa.buleje.test/tienda/serum-vitamina-c");
    expect(body.share.text).toContain("Musa Belleza");
    expect(body.share.text).not.toContain("Buleje");
  });

  it("share sin negocio (sin cabecera) ya no cae al negocio por defecto", async () => {
    const res = await compartir(req("https://www.buleje.test/api/products/share?id=5"));
    expect(res.status).toBe(404);
  });
});

describe("armarFeedXml (puro)", () => {
  const base: ProductoDelFeed = {
    id: 1, nombre: "Aceite", categoria: "Abarrotes", unidad: "L", precio: 8, imagen: "", imagenesExtra: [],
    descripcion: null, marca: null, codigoBarras: null, etiqueta: null, disponible: true,
  };

  it("un producto por ficha (el de id menor) y nada con precio 0", () => {
    const { xml, items } = armarFeedXml({ nombre: "N", base: "https://n.pe" }, [
      { ...base, id: 9, precio: 99 },
      { ...base, id: 2, precio: 8 },
      { ...base, id: 3, nombre: "Gratis", precio: 0 },
    ], new Date(0));
    expect(items).toBe(1);
    expect(xml).toContain("<g:id>2</g:id>");
    expect(xml).not.toContain("<g:id>9</g:id>");
    expect(xml).not.toContain("Gratis");
  });

  it("GTIN: dígito verificador y códigos internos", () => {
    expect(gtinValido("4006381333931")).toBe("4006381333931");
    expect(gtinValido("036000291452")).toBe("036000291452");
    expect(gtinValido("96385074")).toBe("96385074");
    expect(gtinValido("4006381333932")).toBeNull();
    expect(gtinValido("2000000000008")).toBeNull();
    expect(gtinValido("ABC123")).toBeNull();
  });
});
