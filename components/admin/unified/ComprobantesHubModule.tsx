"use client";

/**
 * ComprobantesHubModule — «Comprobantes» (`?tab=facturacion`): los papeles que
 * salen de una venta, en UNA fila de pestañas (plan «panel unificado», ola 3,
 * fusión F12).
 *
 * Antes vivían en Documentos › Facturación SUNAT › 5 pestañas, al lado del
 * drive y los contratos: tres niveles y tres asuntos distintos en un hub. Ahora
 * Facturas y boletas, Notas de crédito, Guías de remisión y Cotizaciones son el
 * único nivel; lo que no era un comprobante se mudó a su casa (Por pagar a
 * Compras, Impuestos a Mi Plata, la conexión con SUNAT a Configuración) y
 * Facturas deja el enlace (`FacturacionModule`).
 *
 * Cada vista declara su `origen` en `lib/admin/subvistas-modulos.ts` (regla
 * R2): su id viejo + `documentos`, porque el plan Pro las veía por el hub de
 * Documentos. Qué vistas se ven depende del plan, la plantilla y el rol, y
 * `useVistaModulo` valida la vista de la URL UNA vez al montar: por eso se
 * espera al rol antes de montar las pestañas (patrón de Equipo y Tienda).
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ClipboardList, FileMinus, ReceiptText, Truck } from "@buleje/design-system/icons";
import { useVistaModulo, type AliasDeVista, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const FacturacionModule = dynamic(() => import("@/components/admin/unified/FacturacionModule"), { loading: S });
const NotasCreditoModule = dynamic(() => import("@/components/admin/NotasCreditoModule"), { loading: S });
const GuiasRemisionModule = dynamic(() => import("@/components/admin/GuiasRemisionModule"), { loading: S });
const CotizacionesModule = dynamic(() => import("@/components/admin/CotizacionesModule"), { loading: S });

const MODULE_ID = "comprobantes-hub";

type Vista = "facturas" | "notas" | "guias" | "cotizaciones";

const TABS: readonly (AdminTab & { id: Vista })[] = [
  { id: "facturas", label: "Facturas y boletas", icon: ReceiptText },
  { id: "notas", label: "Notas de crédito", icon: FileMinus },
  { id: "guias", label: "Guías de remisión", icon: Truck },
  { id: "cotizaciones", label: "Cotizaciones", icon: ClipboardList },
];

/**
 * Nombres viejos de la vista → la de hoy: los ids del hub de Documentos
 * (`facturacion`, `notas`…) y los de las pestañas sueltas que llegaban con
 * `initialTab`. El hook los aplica a la URL y a la memoria, pero no a la
 * forzada: esa se traduce a mano abajo.
 */
const ALIAS: AliasDeVista<Vista> = {
  facturacion: "facturas",
  "e-factura": "facturas",
  "notas-credito": "notas",
  "guias-remision": "guias",
};

/** Cada vista lleva su sección en `?sub=`: al salir, no viaja a la vista siguiente. */
const PARAMS_DE_VISTA: ParamsDeVista<Vista> = { facturas: ["sub"], notas: ["sub"], guias: ["sub"], cotizaciones: ["sub"] };

const AYUDA_DEL_HUB =
  "Los papeles de tus ventas: boletas y facturas, las notas que las corrigen, las guías del traslado y las cotizaciones antes de vender.";

/** Cuánto se espera al rol antes de abrir igual (con las vistas propias del hub). */
const ESPERA_DEL_ROL_MS = 4000;

export default function ComprobantesHubModule({ initialTab }: { initialTab?: string } = {}) {
  const rolListo = useContextoPermiso() !== null;
  const rolTarde = useEsperaVencida(!rolListo, ESPERA_DEL_ROL_MS);
  if (!rolListo && !rolTarde) return <S />;
  return <HubComprobantes initialTab={initialTab} />;
}

/** `true` cuando `esperando` lleva `ms` sin resolverse. */
function useEsperaVencida(esperando: boolean, ms: number): boolean {
  const [vencida, setVencida] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setVencida(true), ms);
    return () => clearTimeout(t);
  }, [esperando, ms]);
  return vencida;
}

function HubComprobantes({ initialTab }: { initialTab?: string }) {
  const tabs = useVistasPermitidas("facturacion", TABS);
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const forzada = initialTab ? (ALIAS[initialTab] ?? initialTab) : undefined;
  const { vista, irA } = useVistaModulo<Vista>(MODULE_ID, tabIds, tabIds[0] ?? "facturas", forzada, {
    alias: ALIAS,
    paramsDeVista: PARAMS_DE_VISTA,
  });

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{ title: "Comprobantes", description: AYUDA_DEL_HUB, icon: ReceiptText }}
        tabs={tabs}
        activeTab={vista}
        onTabChange={(id) => irA(id as Vista)}
        moduleId={MODULE_ID}
      >
        {vista === "facturas" && <FacturacionModule />}
        {vista === "notas" && <NotasCreditoModule />}
        {vista === "guias" && <GuiasRemisionModule />}
        {vista === "cotizaciones" && <CotizacionesModule />}
      </AdminTabBar>
    </div>
  );
}
