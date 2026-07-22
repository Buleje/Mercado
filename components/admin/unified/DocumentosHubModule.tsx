"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { FileCheck, ClipboardList, Truck, FileMinus, FileSignature, Archive } from "@buleje/design-system/icons";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Documentos comerciales & SUNAT (consolidación 6→1) ────────────────
// Antes eran 6 módulos top-level separados (facturacion, cotizaciones,
// guias-remision, notas-credito, contratos, documentos). Ahora viven como
// sub-tabs de este hub: 1 entrada conceptual, más funciones, una sola "casa de
// papeles".
// Brandon 2026-07-22: el hub ya NO pinta su propio título. Antes quedaban dos
// encabezados apilados diciendo casi lo mismo ("Documentos" y, debajo,
// "Documentación"/"Contratos"/…), con sus dos descripciones: ~90px verticales
// para repetir el contexto que el sub-tab activo ya marca. Ahora el contexto lo
// da una miga de pan de una línea y el ÚNICO título de la pantalla es el del
// módulo que se está viendo.
const FacturacionModule   = dynamic(() => import("@/components/admin/unified/FacturacionModule"),     { loading: S });
const CotizacionesModule  = dynamic(() => import("@/components/admin/CotizacionesModule"),            { loading: S });
const GuiasRemisionModule = dynamic(() => import("@/components/admin/GuiasRemisionModule"),           { loading: S });
const NotasCreditoModule  = dynamic(() => import("@/components/admin/NotasCreditoModule"),            { loading: S });
const ContratosModule     = dynamic(() => import("@/components/admin/ContratosModule"),               { loading: S });
const DriveDocumentos     = dynamic(() => import("@/components/admin/documentos/DocumentosModule"),   { loading: S, ssr: false });

const MODULE_ID = "documentos-hub";

const TABS = [
  { id: "facturacion",  label: "Facturación SUNAT", icon: FileCheck },
  { id: "cotizaciones", label: "Cotizaciones",      icon: ClipboardList },
  { id: "guias",        label: "Guías de Remisión", icon: Truck },
  { id: "notas",        label: "Notas de Crédito",  icon: FileMinus },
  { id: "contratos",    label: "Contratos",         icon: FileSignature },
  { id: "drive",        label: "Documentación",     icon: Archive },
];

export default function DocumentosHubModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return localStorage.getItem(`admin-last-tab-${MODULE_ID}`) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminBreadcrumb
        items={[
          { label: "Documentos" },
          { label: TABS.find((t) => t.id === sub)?.label ?? "" },
        ]}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "facturacion" && <FacturacionModule />}
        {sub === "cotizaciones" && <CotizacionesModule />}
        {sub === "guias" && <GuiasRemisionModule />}
        {sub === "notas" && <NotasCreditoModule />}
        {sub === "contratos" && <ContratosModule />}
        {sub === "drive" && <DriveDocumentos />}
      </AdminTabBar>
    </div>
  );
}
