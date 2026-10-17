"use client";

/**
 * /admin?tab=pagina-inicio&vista=contenido — Tienda online › Contenido.
 *
 * 10-10 (panel unificado, ola 2): sin cabecera propia. El título es el de la
 * barra de «Tienda online»; «Ver tienda» pasa al riel de estas pestañas
 * (`heading.actions`: anidada, sólo se dibujan las acciones). Branding → «Marca».
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
 * Patrón: AdminTabBar anidada (2.º nivel de Tienda online, `?sub=`).
 */

import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Palette,
  Megaphone,
  ExternalLink,
  Sparkles,
  Layers,
  Images,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { button } from "@/components/ui-system/button-variants";
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
  { id: "sections",    label: "Secciones",               shortLabel: "Secciones", icon: Layers },
  // Se queda acá hasta la ola 4, que la lleva a Marketplace › Mi tienda en el marketplace.
  { id: "branding",    label: "Marca en el marketplace", shortLabel: "Marca",   icon: Sparkles },
  { id: "banners",     label: "Banners",                 shortLabel: "Banners", icon: Images },
  { id: "promotions",  label: "Promociones del inicio",  shortLabel: "Promociones", icon: Megaphone },
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
      <AdminTabBar
        heading={{
          title: "Contenido",
          actions: (
            <Link
              href={`/t/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={button({ variant: "secondary", className: "rounded-xl" })}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Ver tienda
            </Link>
          ),
        }}
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
