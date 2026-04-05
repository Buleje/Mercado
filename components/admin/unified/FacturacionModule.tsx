"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Receipt, FileCheck, Calculator, CreditCard } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const InvoicingTab = dynamic(() => import("@/components/admin/InvoicingTab"), { loading: S });
const EInvoiceTab = dynamic(() => import("@/components/admin/EInvoiceTab"), { loading: S });
const TaxTab = dynamic(() => import("@/components/admin/TaxTab"), { loading: S });
const PayablesTab = dynamic(() => import("@/components/admin/PayablesTab"), { loading: S });

const MODULE_ID = "facturacion";

const TABS = [
  { id: "facturacion", label: "Facturación", icon: Receipt },
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
      />

      {sub === "facturacion" && <InvoicingTab />}
      {sub === "e-factura" && <EInvoiceTab />}
      {sub === "impuestos" && <TaxTab />}
      {sub === "cxp" && <PayablesTab />}
    </div>
  );
}
