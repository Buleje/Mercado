/**
 * Contract test: `/api/marketplace/products/[id]` debe matchear
 * `MarketplaceProductSchema`. Si el endpoint cambia shape sin actualizar el
 * schema, este test falla — el cliente (PDP) se rompería silenciosamente
 * en prod.
 *
 * Estrategia: mockear Prisma con un shape realista y verificar que:
 *  1. El response del endpoint pasa `MarketplaceProductSchema.safeParse()`.
 *  2. Los campos críticos (`id`, `price`, `store.slug`) están presentes.
 *  3. NULL opcionales no rompen el parse.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MarketplaceProductSchema } from "@/lib/validations/marketplace-product.schema";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/marketplace/products/[id]/route";

const FULL_PRODUCT = {
  id: 42,
  name: "Arroz Superior 5kg",
  description: "Arroz Superior de la mejor calidad",
  category: "abarrotes",
  price: 28.9,
  image: "/products/arroz-5kg.svg",
  unit: "kg",
  badge: "Top",
  stock: 100,
  metaTitle: "Arroz Superior 5kg",
  metaDescription: "Compra arroz Superior",
  ogImage: "/products/arroz-5kg.svg",
  images: [
    { id: "img-1", url: "/products/arroz-5kg.svg", alt: "Arroz", isPrimary: true, position: 1 },
  ],
  variants: [
    {
      id: "var-1",
      name: "5kg",
      sku: "ARZ-5",
      priceModifier: 0,
      stock: 50,
      attributesJson: { peso: "5kg" },
    },
  ],
  storeProducts: [
    {
      id: "sp-1",
      retailPrice: 28.9,
      wholesalePrice: 25.0,
      minOrderQty: 1,
      store: {
        id: "store-1",
        name: "Bodega San Martin",
        slug: "bodega-san-martin",
        logo: null,
        description: null,
        zone: "Calleria",
      },
    },
  ],
};

function makeRequest() {
  return new NextRequest(new URL("http://localhost/api/marketplace/products/42"));
}

async function callGet(id: string) {
  const res = await GET(makeRequest(), { params: Promise.resolve({ id }) });
  return { status: res.status, body: await res.json() };
}

describe("Contract: /api/marketplace/products/[id]", () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findFirst).mockReset();
  });

  it("response shape pasa MarketplaceProductSchema", async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValueOnce(FULL_PRODUCT as never);
    const { status, body } = await callGet("42");
    expect(status).toBe(200);
    const parsed = MarketplaceProductSchema.safeParse(body.data);
    if (!parsed.success) {
      // Devuelve detalle legible si falla.
      throw new Error(
        `Contract violation:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it("campos críticos están presentes y con tipos correctos", async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValueOnce(FULL_PRODUCT as never);
    const { body } = await callGet("42");
    expect(typeof body.data.id).toBe("number");
    expect(typeof body.data.price).toBe("number");
    expect(typeof body.data.store.slug).toBe("string");
    expect(Array.isArray(body.data.images)).toBe(true);
  });

  it("NULL opcionales no rompen el schema (description, badge, metaTitle, stock)", async () => {
    const withNulls = {
      ...FULL_PRODUCT,
      description: null,
      badge: null,
      stock: null,
      metaTitle: null,
      metaDescription: null,
      ogImage: null,
      storeProducts: [
        {
          ...FULL_PRODUCT.storeProducts[0],
          wholesalePrice: null,
          store: { ...FULL_PRODUCT.storeProducts[0].store, logo: null, description: null, zone: null },
        },
      ],
      variants: [],
      images: [],
    };
    vi.mocked(prisma.product.findFirst).mockResolvedValueOnce(withNulls as never);
    const { status, body } = await callGet("42");
    expect(status).toBe(200);
    const parsed = MarketplaceProductSchema.safeParse(body.data);
    if (!parsed.success) {
      throw new Error(`Parse fail on nulls:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
    }
    expect(parsed.success).toBe(true);
  });

  it("400 si id no es entero positivo", async () => {
    const { status } = await callGet("abc");
    expect(status).toBe(400);
  });

  it("404 si product.findFirst devuelve null", async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValueOnce(null);
    const { status } = await callGet("99999");
    expect(status).toBe(404);
  });
});
