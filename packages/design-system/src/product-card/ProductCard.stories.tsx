import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProductCardCompact } from "./ProductCardCompact";
import { ProductCardGrid } from "./ProductCardGrid";
import { ProductCardHero } from "./ProductCardHero";
import type { ProductCardProduct } from "./types";

/**
 * Producto sample para todas las stories. Se clona y muta para variantes.
 */
const sampleProduct: ProductCardProduct = {
  id: 1,
  name: "Aceite de oliva extra virgen 500ml",
  price: 28.9,
  originalPrice: 35.0,
  image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800",
  imageAlt: "Botella de aceite de oliva extra virgen",
  category: "Aceites y vinagres",
  unit: "x 500ml",
  rating: 4.6,
  reviewCount: 127,
  storeName: "Buleje",
  storeSlug: "san-martin",
  stock: 42,
};

// ── Hero ──────────────────────────────────────────────────────────────────────
const heroMeta: Meta<typeof ProductCardHero> = {
  title: "Design System/ProductCard/Hero",
  component: ProductCardHero,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "ProductCardHero — card grande para productos destacados. 2-col desktop (imagen 60% + info 40%), stack mobile. Altura minima 420px. Usar para Oferta del dia, featured y top 2-4 de categoria. NO usar en grids de catalogo — ahi va ProductCardGrid.",
      },
    },
  },
  argTypes: {
    variant: { control: "select", options: ["default", "oferta", "nuevo"] },
    priority: { control: "boolean" },
  },
  tags: ["autodocs"],
};

export default heroMeta;

type HeroStory = StoryObj<typeof heroMeta>;

export const HeroDefault: HeroStory = {
  args: {
    product: sampleProduct,
    variant: "default",
  },
};

export const HeroOferta: HeroStory = {
  args: {
    product: {
      ...sampleProduct,
      discountPct: 25,
      originalPrice: 38.53,
      price: 28.9,
    },
    variant: "oferta",
  },
};

export const HeroNuevo: HeroStory = {
  args: {
    product: {
      ...sampleProduct,
      name: "Cacao organico Tingo Maria 250g",
      price: 18.5,
      originalPrice: undefined,
      badge: undefined,
      category: "Recien llegados",
    },
    variant: "nuevo",
  },
};

// ── Grid ──────────────────────────────────────────────────────────────────────
export const GridDefault: StoryObj<typeof ProductCardGrid> = {
  name: "Grid/Default",
  render: (args) => (
    <div className="max-w-[280px]">
      <ProductCardGrid {...args} />
    </div>
  ),
  args: {
    product: sampleProduct,
    onAddToCart: () => {},
    onAddToFavorites: () => {},
  },
};

export const GridAgotado: StoryObj<typeof ProductCardGrid> = {
  name: "Grid/Agotado",
  render: (args) => (
    <div className="max-w-[280px]">
      <ProductCardGrid {...args} />
    </div>
  ),
  args: {
    product: { ...sampleProduct, stock: 0 },
    onAddToCart: () => {},
    onAddToFavorites: () => {},
  },
};

export const GridOferta: StoryObj<typeof ProductCardGrid> = {
  name: "Grid/Oferta",
  render: (args) => (
    <div className="max-w-[280px]">
      <ProductCardGrid {...args} />
    </div>
  ),
  args: {
    product: {
      ...sampleProduct,
      badge: "oferta",
      originalPrice: 45,
      price: 28.9,
    },
    onAddToCart: () => {},
    onAddToFavorites: () => {},
  },
};

// ── Grid multi — contexto real ────────────────────────────────────────────────
export const GridMulti: StoryObj<typeof ProductCardGrid> = {
  name: "Grid/Multi (contexto real)",
  render: () => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <ProductCardGrid
          key={i}
          product={{
            ...sampleProduct,
            id: i,
            name: [
              "Aceite oliva 500ml",
              "Quinua blanca x 1kg",
              "Cacao organico 250g",
              "Miel de abeja 340g",
              "Panela granulada 500g",
            ][i],
            price: [28.9, 14.5, 18.5, 22.0, 9.9][i],
            originalPrice: i === 0 ? 35 : undefined,
            badge: i === 0 ? "oferta" : i === 2 ? "nuevo" : undefined,
            stock: i === 4 ? 0 : 10,
          }}
          onAddToCart={() => {}}
          onAddToFavorites={() => {}}
        />
      ))}
    </div>
  ),
};

// ── Compact ───────────────────────────────────────────────────────────────────
export const CompactDefault: StoryObj<typeof ProductCardCompact> = {
  name: "Compact/Default",
  args: {
    product: sampleProduct,
  },
};

export const CompactConDiscount: StoryObj<typeof ProductCardCompact> = {
  name: "Compact/Con discount",
  args: {
    product: {
      ...sampleProduct,
      originalPrice: 39.9,
      price: 24.9,
    },
    onAddToCart: () => {},
  },
};

export const CompactCarousel: StoryObj<typeof ProductCardCompact> = {
  name: "Compact/Carousel (contexto real)",
  render: () => (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <ProductCardCompact
          key={i}
          product={{
            ...sampleProduct,
            id: i,
            name: `Producto ${i + 1}`,
            price: 10 + i * 3.5,
            originalPrice: i % 2 === 0 ? 20 + i * 3 : undefined,
            stock: i === 3 ? 0 : 10,
          }}
        />
      ))}
    </div>
  ),
};
