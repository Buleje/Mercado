import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bodega San Martín",
    short_name: "BSM",
    description:
      "Tienda virtual de abarrotes en Pucallpa. Delivery, Yape y Efectivo.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2d6a4f",
    orientation: "portrait-primary",
    lang: "es",
    categories: ["shopping", "food"],
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
    ],
    shortcuts: [
      {
        name: "Ver Productos",
        url: "/#productos",
        description: "Ver catálogo de productos",
      },
    ],
  };
}
