/**
 * Stories para RecipeCardCanonical — ADR-075 Fase 5.
 *
 * Cubre las 5 variantes requeridas:
 *   1. Default (con imagen)
 *   2. NoImage (usa RecipeImagePlaceholder)
 *   3. Compact
 *   4. WithBadges ("30 min", "Facil", rating)
 *   5. Mobile (viewport 375px)
 */

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeCardCanonical } from "./recipe-card";

const meta = {
  title: "Marketplace/RecipeCardCanonical",
  component: RecipeCardCanonical,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Card canonical de receta. Unica fuente de verdad para el recetario. " +
          "Sigue el mismo patron que StoreCardCanonical: aspect-[4/3], sin sombras, slots abiertos.",
      },
    },
  },
  args: {
    recipeId: "rec-001",
    name: "Arroz con Pollo",
    slug: "arroz-con-pollo",
  },
} satisfies Meta<typeof RecipeCardCanonical>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── 1. Default — con imagen ───────────────────────────────────────────────────

export const Default: Story = {
  name: "Default (con imagen)",
  args: {
    recipeId: "rec-001",
    name: "Arroz con Pollo",
    slug: "arroz-con-pollo",
    imageUrl: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80",
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};

// ── 2. NoImage — usa RecipeImagePlaceholder ───────────────────────────────────

export const NoImage: Story = {
  name: "NoImage (placeholder)",
  args: {
    recipeId: "rec-002",
    name: "Ceviche de Paiche",
    slug: "ceviche-de-paiche",
    imageUrl: null,
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};

// ── 3. Compact ────────────────────────────────────────────────────────────────

export const Compact: Story = {
  name: "Compact",
  args: {
    recipeId: "rec-003",
    name: "Lomo Saltado",
    slug: "lomo-saltado",
    imageUrl: null,
    variant: "compact",
  },
  decorators: [
    (Story) => (
      <div className="w-48">
        <Story />
      </div>
    ),
  ],
};

// ── 4. WithBadges — tiempo + dificultad + rating ─────────────────────────────

const BadgesExample = () => (
  <>
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-medium text-[var(--text-secondary)]">
      30 min
    </span>
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-medium text-[var(--text-secondary)]">
      Facil
    </span>
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-medium text-[var(--text-secondary)]">
      4.8
    </span>
  </>
);

const FooterExample = () => (
  <div className="flex items-center justify-between">
    <span className="text-[var(--text-tertiary)]">8 ingredientes</span>
    <span className="font-extrabold text-[var(--accent)]">S/ 18.50</span>
  </div>
);

export const WithBadges: Story = {
  name: "WithBadges (30 min + Facil + rating)",
  args: {
    recipeId: "rec-004",
    name: "Sopa Criolla Pucallpina",
    slug: "sopa-criolla",
    imageUrl: null,
    badges: <BadgesExample />,
    footer: <FooterExample />,
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};

// ── 5. Mobile — 375px ─────────────────────────────────────────────────────────

export const Mobile: Story = {
  name: "Mobile (375px)",
  args: {
    recipeId: "rec-005",
    name: "Papa a la Huancaina",
    slug: "papa-huancaina",
    imageUrl: null,
    badges: <BadgesExample />,
    footer: <FooterExample />,
  },
  decorators: [
    (Story) => (
      <div className="w-full">
        <Story />
      </div>
    ),
  ],
  globals: {
    viewport: {
      value: "mobile1",
      isRotated: false
    }
  },
};
