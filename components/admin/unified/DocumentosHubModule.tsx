"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Archive, FileSignature, FolderArchive, Stamp, Star } from "@buleje/design-system/icons";
import { useVistaModulo, type AliasDeVista, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import { useMiRol } from "@/hooks/use-mi-rol";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { ProveedorAccionesDeLaVista } from "@/components/admin/shared/libro-acciones-vista";
import { ProveedorHuecoLateral } from "@/components/admin/documentos/esenciales/hueco-lateral";
import { ProveedorHuecoAvisos } from "@/components/admin/documentos/AvisosCabecera";
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
const PapelesEmitidos = dynamic(() => import("@/components/admin/documentos/papeles/PapelesEmitidosVista"), { loading: S, ssr: false });

const MODULE_ID = "documentos-hub";

type Vista = "drive" | "esenciales" | "contratos" | "papeles";

const TABS: readonly (AdminTab & { id: Vista })[] = [
  { id: "drive", label: "Archivo", icon: Archive },
  // Las carpetas marcadas en el Archivo («Llevar a Esenciales», Brandon 23-10).
  { id: "esenciales", label: "Esenciales", icon: Star },
  { id: "contratos", label: "Contratos", icon: FileSignature },
  // Lo que emite el programa `papel` con su QR (ADR-534): solo dueño y admin,
  // los mismos roles de `/api/admin/papeles`.
  { id: "papeles", label: "Papeles emitidos", icon: Stamp },
];

const ROLES_PAPELES: ReadonlySet<string> = new Set(["admin", "owner"]);

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
  "El archivo del negocio: tus documentos con su vencimiento, las carpetas esenciales a mano, los contratos con sus plantillas y firmas, y los papeles que emitiste con su QR. Facturas, guías y cotizaciones están en Comprobantes.";

export default function DocumentosHubModule({ initialTab }: { initialTab?: string } = {}) {
  // Las dos vistas son de esta pestaña (Contratos también declara `contratos`
  // como origen), así que no hace falta esperar al rol para validar la URL.
  const rol = useMiRol();
  const permitidas = useVistasPermitidas("documentos", TABS);
  /* Papeles: se esconde cuando el rol YA se sabe y no es dueño ni admin. Mientras
     carga queda: la vista inicial se decide al montar, y sin ella un
     `?vista=papeles` (o la última vista recordada) caía en el Archivo. Si un
     cajero llega igual, la vista dice que es solo para dueño y admin (la ruta da 403). */
  const tabs = useMemo(
    () => permitidas.filter((t) => t.id !== "papeles" || rol == null || ROLES_PAPELES.has(rol)),
    [permitidas, rol],
  );
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
  /* Los avisos de la vista (vencidos, por ordenar, papeles sin leer…) en la
     fila de las pestañas, a su derecha (Brandon 31-10: «que pase arriba… para
     que ocupe menos espacio»): antes eran una o dos filas propias encima de
     los documentos. Cada vista los manda con `AvisosCabecera`. */
  const [huecoAvisos, setHuecoAvisos] = useState<HTMLElement | null>(null);
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
        rightSlot={<div ref={setHuecoAvisos} className="flex items-center gap-1.5" data-qa="avisos-documentos" />}
      >
        <ProveedorAccionesDeLaVista value={hueco}>
          <ProveedorHuecoAvisos value={huecoAvisos}>
          <ProveedorHuecoLateral value={lateral}>
            {vista === "drive" && <DriveDocumentos />}
            {vista === "esenciales" && (
              <EsencialesDocumentos onAbrirEnArchivo={(id) => irA("drive", id ? { sub: "folder", carpeta: id } : {})} />
            )}
            {vista === "contratos" && <ContratosModule />}
            {vista === "papeles" && <PapelesEmitidos />}
          </ProveedorHuecoLateral>
          </ProveedorHuecoAvisos>
        </ProveedorAccionesDeLaVista>
      </AdminTabBar>
    </div>
  );
}
