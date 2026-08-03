"use client";

/**
 * /admin?tab=pagina-inicio — Contenido publico del storefront del tenant.
 *
 * v2 mayo 2026 (Brandon · Opcion A — renombrar + reducir alcance):
 *   - Pasa de 9 tabs a 4 tabs unicos (sin duplicar otros modulos del admin)
 *   - Label visible: "Mi tienda publica" (era "Pagina de inicio" confuso)
 *
 * Tabs activos (ADR-299 fase 3 — solo contenido de pagina, sin duplicados):
 *   - Secciones (builder de bloques: about/horarios/pago/FAQ/galeria/imagen-texto)
 *   - Branding marketplace (logo + banner para /marketplace/[slug])
 *   - Banners de tienda (StoreBanner hero/featured/promo)
 *   - Promociones del home (banners rotantes)
 *
 * Movidos al editor unificado "Identidad y tema" (ADR-299 fase 3):
 *   - Hero / Apariencia · Diseño · Metricas storefront · Contacto · SEO
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

import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Palette,
  Megaphone,
  ExternalLink,
  Sparkles,
  Globe,
  Layers,
  Images,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import MarketplaceBrandingTab from "./_components/MarketplaceBrandingTab";
import PromotionsTab from "./_components/PromotionsTab";
import SectionsTab from "./_components/SectionsTab";
// Banners del storefront (StoreBanner — hero/featured/promo). Editor Prisma ya
// construido pero antes huérfano; montado aquí (Ola 2). Brandon 2026-06-20.
import BannerEditorTab from "@/components/admin/marketplace/BannerEditorTab";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";

const MODULE_ID = "pagina-inicio";

type TabId =
  | "sections"
  | "branding"
  | "banners"
  | "promotions";

type TabConfig = {
  id: TabId;
  label: string;
  shortLabel?: string;
  icon: typeof Palette;
};

// ADR-299 fase 3: quitados Hero/Diseño/Métricas (duplicados → ahora en el
// editor unificado "Identidad y tema"). Quedan solo los tabs ÚNICOS de
// contenido de página. El icono `Palette` queda usado por `typeof Palette`.
const TABS: TabConfig[] = [
  { id: "sections",    label: "Secciones",            shortLabel: "Sec.",     icon: Layers },
  { id: "branding",    label: "Branding marketplace", shortLabel: "Branding", icon: Sparkles },
  { id: "banners",     label: "Banners de tienda",    shortLabel: "Banners",  icon: Images },
  { id: "promotions",  label: "Promociones del home", shortLabel: "Promos",   icon: Megaphone },
];

const VALID_TABS = TABS.map((t) => t.id) as readonly TabId[];

/**
 * Este módulo usa `useSubvistaModulo` (`?sub=`) y no `?vista=`: se renderiza
 * DENTRO de MiTiendaHubModule, que ya es dueño de ese parámetro. Dos componentes
 * escribiendo el mismo se pisarían — el de adentro le cambiaría la pestaña al
 * de afuera en cada click.
 */
export default function StorePageAdminPage() {
  const { vista: tab, irA: setTab } = useSubvistaModulo<TabId>(MODULE_ID, VALID_TABS, "sections");
  const [slug, setSlug] = useState("main");


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
        // ADR-299 fase 3: Hero, Diseño, Contacto, SEO y Métricas se movieron al
        // editor unificado "Identidad y tema" (fuente de verdad). Acá quedan los
        // tabs ÚNICOS de contenido de página.
        description="Secciones, branding, banners y promos del home. El hero, colores, contacto, SEO y métricas se editan en 'Identidad y tema'."
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
        {tab === "sections" && <SectionsTab slug={slug} />}
        {tab === "branding" && <MarketplaceBrandingTab />}
        {tab === "banners" && <BannerEditorTab storeSlug={slug} />}
        {tab === "promotions" && <PromotionsTab />}
      </div>
    </div>
  );
}
