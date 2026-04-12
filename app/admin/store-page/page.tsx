"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Palette,
  Package,
  Megaphone,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import AppearanceTab from "./_components/AppearanceTab";
import ProductsTab from "./_components/ProductsTab";
import PromotionsTab from "./_components/PromotionsTab";
import AnalyticsTab from "./_components/AnalyticsTab";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";

type TabId = "appearance" | "products" | "promotions" | "analytics";

const TABS: { id: TabId; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "products", label: "Productos", icon: Package },
  { id: "promotions", label: "Promociones", icon: Megaphone },
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
          <h1 className="text-3xl font-black mb-1">Mi Página Individual</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm max-w-2xl">
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm transition-colors"
        >
          Ver página pública
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800 mb-6 overflow-x-auto">
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
                    ? "border-teal-600 text-teal-600 dark:text-teal-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
        {tab === "products" && <ProductsTab />}
        {tab === "promotions" && <PromotionsTab />}
        {tab === "analytics" && <AnalyticsTab />}
      </div>
    </div>
  );
}
