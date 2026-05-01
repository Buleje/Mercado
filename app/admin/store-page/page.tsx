"use client";

/**
 * /admin?tab=pagina-inicio — Personalización de la página individual del tenant.
 *
 * Reescrita para alinearse al patrón estándar del admin (AdminModuleHeader +
 * AdminTabBar) usado en EInvoice, POSCaja, Compras, etc.
 *
 * Tabs:
 *   - Apariencia
 *   - Branding marketplace
 *   - Productos / Variaciones / Combos / Descuentos
 *   - Promociones / Engagement
 *   - Métricas
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Palette,
  Package,
  Megaphone,
  BarChart3,
  ExternalLink,
  Percent,
  Boxes,
  Gamepad2,
  Sparkles,
  Layers,
  Globe,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AppearanceTab from "./_components/AppearanceTab";
import MarketplaceBrandingTab from "./_components/MarketplaceBrandingTab";
import VariationsTab from "./_components/VariationsTab";
import ProductsTab from "./_components/ProductsTab";
import PromotionsTab from "./_components/PromotionsTab";
import AnalyticsTab from "./_components/AnalyticsTab";
import CombosTab from "./_components/CombosTab";
import DiscountsTab from "./_components/DiscountsTab";
import EngagementTab from "./_components/EngagementTab";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";

const MODULE_ID = "pagina-inicio";

type TabId =
  | "appearance"
  | "branding"
  | "products"
  | "variations"
  | "promotions"
  | "combos"
  | "discounts"
  | "engagement"
  | "analytics";

type TabConfig = {
  id: TabId;
  label: string;
  shortLabel?: string;
  icon: typeof Palette;
};

const TABS: TabConfig[] = [
  { id: "appearance", label: "Apariencia", shortLabel: "Look", icon: Palette },
  { id: "branding", label: "Branding marketplace", shortLabel: "Branding", icon: Sparkles },
  { id: "products", label: "Productos", shortLabel: "Prod.", icon: Package },
  { id: "variations", label: "Variaciones", shortLabel: "Var.", icon: Layers },
  { id: "combos", label: "Combos", icon: Boxes },
  { id: "discounts", label: "Descuentos", shortLabel: "Desc.", icon: Percent },
  { id: "promotions", label: "Promociones", shortLabel: "Promos", icon: Megaphone },
  { id: "engagement", label: "Engagement", icon: Gamepad2 },
  { id: "analytics", label: "Métricas", icon: BarChart3 },
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
    <div className="space-y-3 sm:space-y-6">
      <AdminModuleHeader
        eyebrow="Mi tienda · Personalización"
        title="Mi página de inicio"
        description="Personaliza la página pública de tu tienda: apariencia, productos destacados, promociones y métricas. Solo afecta a tu página, nunca al marketplace general."
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
        {tab === "branding" && <MarketplaceBrandingTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "variations" && <VariationsTab />}
        {tab === "combos" && <CombosTab />}
        {tab === "discounts" && <DiscountsTab />}
        {tab === "promotions" && <PromotionsTab />}
        {tab === "engagement" && <EngagementTab />}
        {tab === "analytics" && <AnalyticsTab />}
      </div>
    </div>
  );
}
