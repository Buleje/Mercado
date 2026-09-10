"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Receipt, FileCheck, Calculator, CreditCard, Landmark, Cable } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const EInvoiceTab = dynamic(() => import("@/components/admin/EInvoiceTab"), { loading: S });
const TaxTab = dynamic(() => import("@/components/admin/TaxTab"), { loading: S });
const ObligacionesTab = dynamic(() => import("@/components/admin/ObligacionesTab"), { loading: S });
const PayablesTab = dynamic(() => import("@/components/admin/PayablesTab"), { loading: S });
/* La pantalla que conecta el negocio con SUNAT. El motor de emisión existía
   desde ADR-045 pero `TenantSunatConfig` estaba en cero: no había dónde cargar
   el RUC ni el token. */
const SunatConexionTab = dynamic(() => import("@/components/admin/sunat/SunatConexionTab"), { loading: S });

const MODULE_ID = "facturacion";

// Brandon 2026-06-15: la sub-pestaña "Facturación" (InvoicingTab) se removió —
// era una maqueta sin persistencia (los comprobantes se perdían al refrescar) y
// redundante con "Factura Electrónica", que es la vía real de emisión a SUNAT.
const TABS = [
  { id: "e-factura", label: "Factura Electrónica", icon: FileCheck },
  { id: "impuestos", label: "Impuestos", icon: Calculator },
  { id: "obligaciones", label: "Obligaciones", icon: Landmark },
  { id: "cxp", label: "Cuentas x Pagar", icon: CreditCard },
  { id: "conexion", label: "Conexión SUNAT", icon: Cable },
];

export default function FacturacionModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla. Recupera ~90px verticales,
          que en una laptop de 677px útiles es la diferencia entre ver los
          datos o sólo los encabezados.
          El `eyebrow` se fue con el header: decía la categoría del sidebar
          («Abastecimiento · Compras» sobre un título «Compras») — el mismo
          dato tres veces contando el ítem marcado en el sidebar. */}
      <AdminTabBar
        heading={{ title: "Facturación", description: "Factura electrónica, impuestos, obligaciones tributarias y cuentas por pagar", icon: Receipt }}
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "e-factura" && <EInvoiceTab />}
        {sub === "impuestos" && <TaxTab />}
        {sub === "obligaciones" && <ObligacionesTab />}
        {sub === "cxp" && <PayablesTab />}
        {sub === "conexion" && <SunatConexionTab />}
      </AdminTabBar>
    </div>
  );
}
