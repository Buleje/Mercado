"use client";

/**
 * /admin?tab=pagina-inicio — Contenido publico del storefront del tenant.
 *
 * v2 mayo 2026 (Brandon · Opcion A — renombrar + reducir alcance):
 *   - Pasa de 9 tabs a 4 tabs unicos (sin duplicar otros modulos del admin)
 *   - Label visible: "Mi tienda publica" (era "Pagina de inicio" confuso)
 *
 * Tabs activos:
 *   - Hero & secciones (era "Apariencia")
 *   - Branding marketplace (logo + banner para /marketplace/[slug])
 *   - Promociones del home (banners rotantes)
 *   - Metricas del storefront (vistas, clicks)
 *
 * Tabs ELIMINADOS (ahora viven en su modulo dedicado):
 *   - Productos        → /admin?tab=productos
 *   - Variaciones      → /admin?tab=productos (sub-tab variantes)
 *   - Combos           → /admin?tab=productos (sub-tab combos)
 *   - Descuentos       → /admin?tab=promociones
 *   - Engagement       → /admin?tab=clientes (CRM/loyalty)
 *
 * Patrón estándar: AdminModuleHeader + AdminTabBar.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Palette,
  Megaphone,
  BarChart3,
  ExternalLink,
  Sparkles,
  Globe,
  Layers,
  Paintbrush,
  Images,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AppearanceTab from "./_components/AppearanceTab";
import MarketplaceBrandingTab from "./_components/MarketplaceBrandingTab";
import PromotionsTab from "./_components/PromotionsTab";
import AnalyticsTab from "./_components/AnalyticsTab";
import SectionsTab from "./_components/SectionsTab";
import DesignTab from "./_components/DesignTab";
// Banners del storefront (StoreBanner — hero/featured/promo). Editor Prisma ya
// construido pero antes huérfano; montado aquí (Ola 2). Brandon 2026-06-20.
import BannerEditorTab from "@/components/admin/marketplace/BannerEditorTab";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";

const MODULE_ID = "pagina-inicio";

type TabId =
  | "appearance"
  | "design"
  | "sections"
  | "branding"
  | "banners"
  | "promotions"
  | "analytics";

type TabConfig = {
  id: TabId;
  label: string;
  shortLabel?: string;
  icon: typeof Palette;
};

const TABS: TabConfig[] = [
  { id: "appearance",  label: "Hero",                 shortLabel: "Hero",     icon: Palette },
  { id: "design",      label: "Diseño",               shortLabel: "Diseño",   icon: Paintbrush },
  { id: "sections",    label: "Secciones",            shortLabel: "Sec.",     icon: Layers },
  { id: "branding",    label: "Branding marketplace", shortLabel: "Branding", icon: Sparkles },
  { id: "banners",     label: "Banners de tienda",    shortLabel: "Banners",  icon: Images },
  { id: "promotions",  label: "Promociones del home", shortLabel: "Promos",   icon: Megaphone },
  { id: "analytics",   label: "Métricas storefront",  shortLabel: "Métricas", icon: BarChart3 },
];

const VALID_TABS = TABS.map((t) => t.id) as readonly TabId[];

function normalizeTab(value: string | null): TabId {
  if (value && (VALID_TABS as readonly string[]).includes(value)) return value as TabId;
  return "appearance";
}

export default function StorePageAdminPage() {
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "appearance";
    return normalizeTab(localStorage.getItem(`admin-last-tab-${MODULE_ID}`));
  });
  const [slug, setSlug] = useState("main");

  useEffect(() => {
    try { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, tab); } catch { /* ignore */ }
  }, [tab]);

  useEffect(() => {
    let active = true;
    void resolveActiveTenantSlug().then((resolved) => {
      if (active) setSlug(resolved);
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-3 sm:space-y-6 overflow-x-hidden">
      <AdminModuleHeader
        eyebrow="Mi tienda pública"
        title="Qué ve el cliente cuando entra a tu storefront"
        // Brandon 2026-05-28: descripción reducida — antes era un párrafo
        // largo con lista de features + 2 links cruzados, ocupaba media
        // pantalla en mobile. Para colores/tipografía existe la tab
        // "Identidad y tema"; para productos/promos, sus módulos dedicados.
        description="Editá el hero, contacto y SEO de tu tienda pública."
        icon={Globe}
      >
        <Link
          href={`/t/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Ver página pública
        </Link>
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          shortLabel: t.shortLabel,
          icon: t.icon,
        }))}
        activeTab={tab}
        onTabChange={(id) => setTab(id as TabId)}
        moduleId={MODULE_ID}
      />

      <div>
        {tab === "appearance" && <AppearanceTab />}
        {tab === "design" && <DesignTab />}
        {tab === "sections" && <SectionsTab />}
        {tab === "branding" && <MarketplaceBrandingTab />}
        {tab === "banners" && <BannerEditorTab storeSlug={slug} />}
        {tab === "promotions" && <PromotionsTab />}
        {tab === "analytics" && <AnalyticsTab />}
      </div>
    </div>
  );
}
