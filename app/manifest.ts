import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bodega San Martín - Abarrotes Delivery Pucallpa",
    short_name: "BSM",
    description:
      "Compra abarrotes online en Pucallpa: bebidas, golosinas, carnes, pollo, productos de limpieza y más. Delivery rápido, paga con Yape o efectivo.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6366f1",
    orientation: "portrait-primary",
    lang: "es",
    dir: "ltr",
    categories: ["shopping", "food", "lifestyle"],
    icons: [
      {
        src: "/api/pwa-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/api/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/pwa-icon/180",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Ver Tienda",
        short_name: "Tienda",
        url: "/tienda",
        description: "Explorar catálogo de productos",
        icons: [{ src: "/api/pwa-icon/96", sizes: "96x96" }],
      },
      {
        name: "Mis Pedidos",
        short_name: "Pedidos",
        url: "/cuenta",
        description: "Ver historial de pedidos",
        icons: [{ src: "/api/pwa-icon/96", sizes: "96x96" }],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
  };
}
