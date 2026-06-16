"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Receipt, FileCheck, Calculator, CreditCard } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const EInvoiceTab = dynamic(() => import("@/components/admin/EInvoiceTab"), { loading: S });
const TaxTab = dynamic(() => import("@/components/admin/TaxTab"), { loading: S });
const PayablesTab = dynamic(() => import("@/components/admin/PayablesTab"), { loading: S });

const MODULE_ID = "facturacion";

// Brandon 2026-06-15: la sub-pestaña "Facturación" (InvoicingTab) se removió —
// era una maqueta sin persistencia (los comprobantes se perdían al refrescar) y
// redundante con "Factura Electrónica", que es la vía real de emisión a SUNAT.
const TABS = [
  { id: "e-factura", label: "Factura Electrónica", icon: FileCheck },
  { id: "impuestos", label: "Impuestos", icon: Calculator },
  { id: "cxp", label: "Cuentas x Pagar", icon: CreditCard },
];

export default function FacturacionModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Facturación"
        description="Facturación electrónica, impuestos y cuentas por pagar"
        icon={Receipt}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "e-factura" && <EInvoiceTab />}
        {sub === "impuestos" && <TaxTab />}
        {sub === "cxp" && <PayablesTab />}
      </AdminTabBar>
    </div>
  );
}
