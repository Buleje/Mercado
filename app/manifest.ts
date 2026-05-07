import type { MetadataRoute } from "next";

/* ────────────────────────────────────────────────────────────────────────────
 * PWA Web App Manifest — served at /manifest.webmanifest
 *
 * Uses dynamic imports so a failed DB connection never breaks the manifest.
 * ──────────────────────────────────────────────────────────────────────────── */

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = "Mi Tienda - Delivery";
  let shortName = "Tienda";
  let description = "Compra online con delivery a domicilio.";
  let themeColor = "var(--accent)";

  try {
    const [{ headers }, { SettingsDB }] = await Promise.all([
      import("next/headers"),
      import("@/lib/db/settings.db"),
    ]);
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";
    const s = await SettingsDB.get(tenantId);
    if (s.businessName) {
      name = `${s.businessName} - Delivery`;
      shortName = s.businessName.slice(0, 12);
    }
    if (s.description) description = s.description;
    if (s.primaryColor) themeColor = s.primaryColor;
  } catch { /* use defaults */ }

  return {
    name,
    short_name: shortName,
    description,
    id: "store-pwa",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: themeColor,
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
