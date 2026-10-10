"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Archive, FileSignature, FolderArchive } from "@buleje/design-system/icons";
import { useVistaModulo, type AliasDeVista, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Documentos (`?tab=documentos`, grupo Gestión) ────────────────────────────
// Plan «panel unificado», ola 3 (fusión F16): el hub de Documentos juntaba tres
// asuntos —comprobantes de venta, contratos y el drive— en tres niveles. Los
// comprobantes (facturas, notas de crédito, guías y cotizaciones) se mudaron a
// «Comprobantes» (`?tab=facturacion`, ComprobantesHubModule) y acá queda lo que
// es archivo del negocio: el drive (por defecto) y los contratos.
//
// Los permisos del drive no se tocan: viven en sus rutas, carpeta por carpeta.
const ContratosModule = dynamic(() => import("@/components/admin/ContratosModule"), { loading: S });
const DriveDocumentos = dynamic(() => import("@/components/admin/documentos/DocumentosModule"), { loading: S, ssr: false });

const MODULE_ID = "documentos-hub";

type Vista = "drive" | "contratos";

const TABS: readonly (AdminTab & { id: Vista })[] = [
  { id: "drive", label: "Archivo", icon: Archive },
  { id: "contratos", label: "Contratos", icon: FileSignature },
];

/**
 * Las vistas que se fueron a Comprobantes: un `?vista=` viejo que se colara
 * (memoria del navegador, un link a medias) cae en el Archivo y no en blanco.
 * Los links enteros los reescribe `VISTA_MIGRATION` antes de llegar acá.
 */
const ALIAS: AliasDeVista<Vista> = {
  documentacion: "drive",
  facturacion: "drive",
  cotizaciones: "drive",
  guias: "drive",
  notas: "drive",
};

/** El drive y Contratos llevan su modo o pestaña interna en `?sub=`: no viaja de una a la otra. */
const PARAMS_DE_VISTA: ParamsDeVista<Vista> = { drive: ["sub"], contratos: ["sub"] };

const AYUDA_DEL_HUB =
  "El archivo del negocio: tus documentos con su vencimiento y los contratos con sus plantillas y firmas. Facturas, guías y cotizaciones están en Comprobantes.";

export default function DocumentosHubModule({ initialTab }: { initialTab?: string } = {}) {
  // Las dos vistas son de esta pestaña (Contratos también declara `contratos`
  // como origen), así que no hace falta esperar al rol para validar la URL.
  const tabs = useVistasPermitidas("documentos", TABS);
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const forzada = initialTab ? (ALIAS[initialTab] ?? initialTab) : undefined;
  const { vista, irA } = useVistaModulo<Vista>(MODULE_ID, tabIds, tabIds[0] ?? "drive", forzada, {
    alias: ALIAS,
    paramsDeVista: PARAMS_DE_VISTA,
  });

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{ title: "Documentos", description: AYUDA_DEL_HUB, icon: FolderArchive }}
        tabs={tabs}
        activeTab={vista}
        onTabChange={(id) => irA(id as Vista)}
        moduleId={MODULE_ID}
      >
        {vista === "drive" && <DriveDocumentos />}
        {vista === "contratos" && <ContratosModule />}
      </AdminTabBar>
    </div>
  );
}
