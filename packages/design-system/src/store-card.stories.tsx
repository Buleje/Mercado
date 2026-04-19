import type { Meta, StoryObj } from "@storybook/react";
import { StoreCardCanonical } from "./store-card";
import { StoreImagePlaceholder } from "./store-image-placeholder";

// ── Datos sample ──────────────────────────────────────────────────────────────

const BASE_STORE = {
  storeId: "store-abc123",
  name: "Bodega El Sol de Pucallpa",
  slug: "bodega-el-sol",
  imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800",
} as const;

// ── StoreCardCanonical meta ───────────────────────────────────────────────────

const meta: Meta<typeof StoreCardCanonical> = {
  title: "Design System/StoreCard/StoreCardCanonical",
  component: StoreCardCanonical,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: [
          "StoreCardCanonical — unica fuente de verdad para cards de tienda (ADR-075).",
          "",
          "**Uso:** `/marketplace/explorar`, grids de busqueda, strips de recomendaciones.",
          "",
          "**Slots abiertos:** `badges` (arriba del nombre) y `footer` (debajo del nombre).",
          "",
          "**Sin imagen:** muestra `StoreImagePlaceholder` con ilustracion rotada deterministicamente.",
          "",
          "**Reglas:** sin sombras, sin emojis, rounded-lg, hover border-strong.",
        ].join("\n"),
      },
    },
  },
  argTypes: {
    variant: { control: "select", options: ["default", "compact"] },
    imageUrl: { control: "text" },
    name: { control: "text" },
  },
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

// ── 1. Default — con imagen ───────────────────────────────────────────────────

export const Default: Story = {
  name: "Default — con imagen",
  render: () => (
    <div style={{ maxWidth: "320px" }}>
      <StoreCardCanonical
        storeId={BASE_STORE.storeId}
        name={BASE_STORE.name}
        slug={BASE_STORE.slug}
        imageUrl={BASE_STORE.imageUrl}
        footer={
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            4.8 estrellas · Centro
          </span>
        }
      />
    </div>
  ),
};

// ── 2. NoImage — sin imageUrl, renderiza placeholder ─────────────────────────

export const NoImage: Story = {
  name: "NoImage — placeholder ilustracion",
  render: () => (
    <div style={{ maxWidth: "320px" }}>
      <StoreCardCanonical
        storeId="store-abc123"
        name="Bodega Sin Foto"
        slug="bodega-sin-foto"
      />
    </div>
  ),
};

// ── 3. Compact — variante reducida para carouseles ────────────────────────────

export const Compact: Story = {
  name: "Compact — variant para carousel",
  render: () => (
    <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "8px" }}>
      {["Bodega El Sol", "Minimarket El Aguila", "Fruteria La Esperanza", "Panaderia Central"].map(
        (name, i) => (
          <div key={i} style={{ minWidth: "200px", maxWidth: "200px" }}>
            <StoreCardCanonical
              storeId={`store-${i}`}
              name={name}
              slug={`tienda-${i}`}
              imageUrl={i % 2 === 0 ? BASE_STORE.imageUrl : undefined}
              variant="compact"
              footer={<span>4.{i + 4} estrellas</span>}
            />
          </div>
        ),
      )}
    </div>
  ),
};

// ── 4. WithBadges — slot badges poblado ──────────────────────────────────────

export const WithBadges: Story = {
  name: "WithBadges — slot badges + footer",
  render: () => (
    <div style={{ maxWidth: "320px" }}>
      <StoreCardCanonical
        storeId="store-badges"
        name="Minimarket El Aguila"
        slug="minimarket-el-aguila"
        imageUrl={BASE_STORE.imageUrl}
        badges={
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 8px",
                borderRadius: "9999px",
                fontSize: "10px",
                fontWeight: 600,
                backgroundColor: "var(--accent-soft)",
                color: "var(--accent)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Abierto
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 8px",
                borderRadius: "9999px",
                fontSize: "10px",
                fontWeight: 600,
                backgroundColor: "var(--data-success-50)",
                color: "var(--data-success-700)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Envio gratis
            </span>
          </div>
        }
        footer={<span>4.9 estrellas · Manantay · 0.8 km</span>}
      />
    </div>
  ),
};

// ── 5. Mobile — viewport 375px ───────────────────────────────────────────────

export const Mobile: Story = {
  name: "Mobile — viewport 375px",
  parameters: {
    viewport: { defaultViewport: "mobile" },
  },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      {[
        { id: "s1", name: "Bodega El Sol", hasImg: true },
        { id: "s2", name: "Fruteria Rosa", hasImg: false },
        { id: "s3", name: "Panaderia San Martin", hasImg: false },
        { id: "s4", name: "Licoreria Las Vegas", hasImg: true },
      ].map(({ id, name, hasImg }) => (
        <StoreCardCanonical
          key={id}
          storeId={id}
          name={name}
          slug={id}
          imageUrl={hasImg ? BASE_STORE.imageUrl : undefined}
          footer={<span>Centro</span>}
        />
      ))}
    </div>
  ),
};

// ── 6. DarkMode — dark theme ─────────────────────────────────────────────────

export const DarkMode: Story = {
  name: "DarkMode — tema oscuro",
  parameters: {
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => {
      if (typeof document !== "undefined") {
        document.documentElement.classList.add("dark");
      }
      return <Story />;
    },
  ],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 280px)",
        gap: "16px",
        padding: "24px",
        backgroundColor: "var(--surface-canvas)",
      }}
    >
      <StoreCardCanonical
        storeId="dark-1"
        name="Bodega Nocturna"
        slug="bodega-nocturna"
        imageUrl={BASE_STORE.imageUrl}
        footer={<span>4.7 estrellas</span>}
      />
      <StoreCardCanonical
        storeId="dark-2"
        name="Minimarket Sin Foto"
        slug="minimarket-sin-foto"
        footer={<span>Yarinacocha</span>}
      />
      <StoreCardCanonical
        storeId="dark-3"
        name="Fruteria La Selva Verde"
        slug="fruteria-la-selva"
        footer={<span>Campo Verde</span>}
      />
    </div>
  ),
};

// ── StoreImagePlaceholder solo ────────────────────────────────────────────────

export const PlaceholderRotation: StoryObj<typeof StoreImagePlaceholder> = {
  name: "Placeholder — rotacion 4 ilustraciones",
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 200px)", gap: "16px" }}>
      {["store-aaa", "store-bbb", "store-ccc", "store-ddd"].map((id) => (
        <div key={id}>
          <StoreImagePlaceholder storeId={id} name={`Tienda ${id}`} />
          <p
            style={{
              fontSize: "10px",
              color: "var(--text-tertiary)",
              textAlign: "center",
              marginTop: "4px",
            }}
          >
            id: {id}
          </p>
        </div>
      ))}
    </div>
  ),
};
