"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Palette, Globe, FileText, Share2, Store } from "@buleje/design-system/icons";
import { useVistaModulo, type AliasDeVista, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Tienda online (panel unificado, ola 2 — 10-10) ───────────────────────────
// Antes «Mi Tienda»: 3 vistas con su propia cabecera y otra barra adentro (13
// pestañas en 3 niveles) y «Canales de venta» como pestaña aparte con las
// mismas visitas. Ahora UNA barra de 4 vistas; Apariencia y Contenido traen su
// 2.º nivel en `?sub=`. Nada se copió: cada vista monta el mismo componente.
const StoreCustomizer      = dynamic(() => import("@/components/admin/StoreCustomizer"),          { loading: S });
const StorePageAdminPage   = dynamic(() => import("@/app/admin/store-page/page"),                 { loading: S });
const PaginasPorBloquesTab = dynamic(() => import("@/components/admin/cms/PaginasPorBloquesTab"), { loading: S });
const SalesChannelsTab     = dynamic(() => import("@/components/admin/tabs/SalesChannelsTab"),    { loading: S });

const MODULE_ID = "mi-tienda-hub";

type Vista = "apariencia" | "contenido" | "paginas" | "redes";

// Sin shortLabel: AdminTabBar lo muestra SIEMPRE que exista, y «Redes» solo
// no dice que adentro están las visitas.
const TABS: { id: Vista; label: string; icon: typeof Palette }[] = [
  { id: "apariencia", label: "Apariencia",       icon: Palette },
  { id: "contenido",  label: "Contenido",        icon: Globe },
  { id: "paginas",    label: "Páginas",          icon: FileText },
  { id: "redes",      label: "Redes y medición", icon: Share2 },
];

/**
 * Nombres viejos → vista de hoy: `?vista=identidad|pagina` de links, favoritos y
 * de la memoria del navegador, y el `initialTab` que todavía mandan los tabs
 * alias (`store-customizer` → identidad, `pagina-inicio` → pagina).
 */
const ALIAS: AliasDeVista<Vista> = { identidad: "apariencia", pagina: "contenido", canales: "redes" };

/** Al dejar Apariencia o Contenido, su `?sub=` no viaja a la vista siguiente. */
const PARAMS_DE_VISTA: ParamsDeVista<Vista> = { apariencia: ["sub"], contenido: ["sub"] };

/** Cuánto se espera al rol antes de abrir igual (con las vistas propias del hub). */
const ESPERA_DEL_ROL_MS = 4000;

export default function MiTiendaHubModule({ initialTab }: { initialTab?: string } = {}) {
  /* Redes y medición llegó de `canales` (Pro) y las otras tres son de Mi Tienda
     (Básico): qué vistas se ven depende del plan, la plantilla y el rol (R2), y
     `useVistaModulo` valida la vista UNA vez, al montar. Sin esperar al rol, un
     negocio que sólo tenía Canales abría Apariencia. */
  const rolListo = useContextoPermiso() !== null;
  const rolTarde = useEsperaVencida(!rolListo, ESPERA_DEL_ROL_MS);
  if (!rolListo && !rolTarde) return <S />;
  return <HubTienda initialTab={initialTab} />;
}

function useEsperaVencida(esperando: boolean, ms: number): boolean {
  const [vencida, setVencida] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setVencida(true), ms);
    return () => clearTimeout(t);
  }, [esperando, ms]);
  return vencida;
}

function HubTienda({ initialTab }: { initialTab?: string }) {
  const tabs = useVistasPermitidas("pagina-inicio", TABS);
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  // La sub-vista vive en `?vista=`: así se comparte por link, el botón «atrás»
  // la recorre y el buscador global puede mandar directo acá. `initialTab` gana
  // cuando el módulo se abre desde un tab alias (ver useVistaModulo); el hook
  // no le aplica el alias a la forzada, por eso se traduce acá.
  const forzada = initialTab ? (ALIAS[initialTab] ?? initialTab) : undefined;
  const { vista: pedida, irA } = useVistaModulo<Vista>(MODULE_ID, tabIds, tabIds[0] ?? "apariencia", forzada, {
    alias: ALIAS,
    paramsDeVista: PARAMS_DE_VISTA,
  });
  // Si el permiso cambió con el módulo abierto, nunca se dibuja una vista vedada.
  const vista = tabIds.includes(pedida) ? pedida : tabIds[0];

  return (
    <div className="space-y-4">
      {/* Un solo título por pantalla: el de esta banda. Las vistas no traen
          cabecera propia; sus acciones van en su fila (Apariencia) o en el
          riel de su 2.º nivel (Contenido). */}
      <AdminTabBar
        heading={{
          title: "Tienda online",
          description: "Cómo se ve tu tienda, qué muestra, sus páginas y de dónde llegan tus visitas.",
          icon: Store,
        }}
        tabs={tabs}
        activeTab={vista}
        onTabChange={irA}
        moduleId={MODULE_ID}
      >
        {vista === "apariencia" && <StoreCustomizer />}
        {vista === "contenido" && <StorePageAdminPage />}
        {vista === "paginas" && <PaginasPorBloquesTab />}
        {vista === "redes" && <SalesChannelsTab />}
      </AdminTabBar>
    </div>
  );
}
