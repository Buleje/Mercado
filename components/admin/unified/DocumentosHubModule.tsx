"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Archive, FileSignature, FolderArchive, Star } from "@buleje/design-system/icons";
import { useVistaModulo, type AliasDeVista, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { ProveedorAccionesDeLaVista } from "@/components/admin/shared/libro-acciones-vista";
import { ProveedorHuecoLateral } from "@/components/admin/documentos/esenciales/hueco-lateral";
import { useColumnaDerecha } from "@/components/admin/layout/columna-derecha";

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
const EsencialesDocumentos = dynamic(() => import("@/components/admin/documentos/esenciales/EsencialesModule"), { loading: S, ssr: false });

const MODULE_ID = "documentos-hub";

type Vista = "drive" | "esenciales" | "contratos";

const TABS: readonly (AdminTab & { id: Vista })[] = [
  { id: "drive", label: "Archivo", icon: Archive },
  // Las carpetas marcadas en el Archivo («Llevar a Esenciales», Brandon 23-10).
  { id: "esenciales", label: "Esenciales", icon: Star },
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

/**
 * El drive y Contratos llevan su modo o pestaña interna en `?sub=`, y
 * Esenciales la carpeta elegida en `?esencial=`: no viajan de una a la otra.
 */
const PARAMS_DE_VISTA: ParamsDeVista<Vista> = { drive: ["sub", "carpeta"], esenciales: ["esencial", "amplia"], contratos: ["sub"] };

const AYUDA_DEL_HUB =
  "El archivo del negocio: tus documentos con su vencimiento, las carpetas esenciales a mano y los contratos con sus plantillas y firmas. Facturas, guías y cotizaciones están en Comprobantes.";

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

  /* Los botones de cada vista (Subir, Indicadores, Nuevo contrato, buscar en
     Esenciales…) van en la MISMA fila que las pestañas, como en los libros
     forestales (Brandon 23-10: «aprovechar mejor el espacio, compactando las
     pestañas y los botones»). Cada vista los manda con `AccionesDeLaVista`.
     El `@container/riel` de afuera mide el ancho: por debajo de 80rem los
     rótulos quedan en ícono (con su nombre en el tooltip). */
  const [hueco, setHueco] = useState<HTMLElement | null>(null);
  /* La columna de la derecha del PANEL (24-10: de arriba hasta abajo, al lado
     del encabezado, que se corre): ahí Esenciales pone el panel de la carpeta
     elegida. Fuera del panel (`null`) no hay columna y el panel va al costado. */
  const lateral = useColumnaDerecha()?.el;

  return (
    <div className="@container/riel min-w-0 space-y-4">
      <AdminTabBar
        heading={{
          title: "Documentos",
          description: AYUDA_DEL_HUB,
          icon: FolderArchive,
          actions: <div ref={setHueco} className="flex flex-wrap items-center justify-end gap-2" data-qa="acciones-documentos" />,
        }}
        tabs={tabs}
        activeTab={vista}
        onTabChange={(id) => irA(id as Vista)}
        moduleId={MODULE_ID}
      >
        <ProveedorAccionesDeLaVista value={hueco}>
          <ProveedorHuecoLateral value={lateral}>
            {vista === "drive" && <DriveDocumentos />}
            {vista === "esenciales" && (
              <EsencialesDocumentos onAbrirEnArchivo={(id) => irA("drive", id ? { sub: "folder", carpeta: id } : {})} />
            )}
            {vista === "contratos" && <ContratosModule />}
          </ProveedorHuecoLateral>
        </ProveedorAccionesDeLaVista>
      </AdminTabBar>
    </div>
  );
}
