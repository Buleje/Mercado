"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const POSView = dynamic(() => import("@/components/admin/POSView"), { loading: S });
const CashRegisterTab = dynamic(() => import("@/components/admin/CashRegisterTab"), { loading: S });
const CashAuditTab = dynamic(() => import("@/components/admin/CashAuditTab"), { loading: S });
const ShiftControlTab = dynamic(() => import("@/components/admin/ShiftControlTab"), { loading: S });

const TABS = [
  { id: "pos" as const, label: "Punto de Venta" },
  { id: "caja" as const, label: "Caja Registradora" },
  { id: "arqueo" as const, label: "Arqueo de Caja" },
  { id: "turnos" as const, label: "Control de Turnos" },
];

export default function POSCajaModule() {
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
      {sub === "pos" && <POSView />}
      {sub === "caja" && <CashRegisterTab />}
      {sub === "arqueo" && <CashAuditTab onNavigateToTurnos={() => setSub("turnos")} />}
      {sub === "turnos" && <ShiftControlTab onNavigateToArqueo={() => setSub("arqueo")} />}
    </div>
  );
}
