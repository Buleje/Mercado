"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const InvoicingTab = dynamic(() => import("@/components/admin/InvoicingTab"), { loading: S });
const EInvoiceTab = dynamic(() => import("@/components/admin/EInvoiceTab"), { loading: S });
const TaxTab = dynamic(() => import("@/components/admin/TaxTab"), { loading: S });
const PayablesTab = dynamic(() => import("@/components/admin/PayablesTab"), { loading: S });

const TABS = [
  { id: "facturacion" as const, label: "Facturación" },
  { id: "e-factura" as const, label: "Factura Electrónica" },
  { id: "impuestos" as const, label: "Impuestos" },
  { id: "cxp" as const, label: "Cuentas x Pagar" },
];

export default function FacturacionModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-card-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
              sub === t.id
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "facturacion" && <InvoicingTab />}
      {sub === "e-factura" && <EInvoiceTab />}
      {sub === "impuestos" && <TaxTab />}
      {sub === "cxp" && <PayablesTab />}
    </div>
  );
}
