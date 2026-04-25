"use client";

import { PageTitle } from "@buleje/design-system";
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
} from "@buleje/design-system/icons";
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

type TabId = "appearance" | "branding" | "products" | "variations" | "promotions" | "combos" | "discounts" | "engagement" | "analytics";

const TABS: { id: TabId; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "branding", label: "Branding Marketplace", icon: Sparkles },
  { id: "products", label: "Productos", icon: Package },
  { id: "variations", label: "Variaciones", icon: Layers },
  { id: "combos", label: "Combos", icon: Boxes },
  { id: "discounts", label: "Descuentos", icon: Percent },
  { id: "promotions", label: "Promociones", icon: Megaphone },
  { id: "engagement", label: "Engagement", icon: Gamepad2 },
  { id: "analytics", label: "Métricas", icon: BarChart3 },
];

export default function StorePageAdminPage() {
  const [tab, setTab] = useState<TabId>("appearance");
  const [slug, setSlug] = useState("main");

  useEffect(() => {
    let active = true;

    void resolveActiveTenantSlug().then((resolved) => {
      if (active) setSlug(resolved);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageTitle className="text-3xl font-extrabold mb-1">Mi Página Individual</PageTitle>
          <p className="text-[var(--text-secondary)] text-sm max-w-2xl">
            Personaliza la página pública de tu tienda. Controla apariencia,
            productos destacados con precio exclusivo, promociones y métricas.
            Todo lo que configures aquí afecta solo a tu página — nunca al
            marketplace general.
          </p>
        </div>
        <Link
          href={`/t/${slug}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-white font-semibold text-sm transition-colors"
        >
          Ver página pública
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--rule-base)] mb-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-semibold text-sm transition-colors ${
                  active
                    ? "border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-gray-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
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
