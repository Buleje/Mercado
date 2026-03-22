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
  { id: "pos" as const, label: "Punto de Venta", shortLabel: "Venta", hint: "Cobrar y buscar" },
  { id: "caja" as const, label: "Caja Registradora", shortLabel: "Caja", hint: "Apertura y cierre" },
  { id: "arqueo" as const, label: "Arqueo de Caja", shortLabel: "Arqueo", hint: "Cuadre rápido" },
  { id: "turnos" as const, label: "Control de Turnos", shortLabel: "Turnos", hint: "Cambio de caja" },
];

export default function POSCajaModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`relative rounded-2xl border px-3 py-3 text-left transition-all ${
              sub === t.id
                ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                : "border-gray-200 bg-white text-gray-600 dark:border-card-border dark:bg-card dark:text-muted"
            }`}
            aria-current={sub === t.id ? "page" : undefined}
          >
            <span className="block text-sm font-extrabold leading-tight">{t.shortLabel}</span>
            <span className={`mt-1 block text-[11px] leading-tight ${sub === t.id ? "text-white/80" : "text-gray-400 dark:text-muted"}`}>
              {t.hint}
            </span>
            {sub === t.id && <span className="absolute inset-x-3 bottom-0 h-1 rounded-full bg-white/70" />}
          </button>
        ))}
      </div>
      <div className="hidden sm:flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none border-b border-gray-200 dark:border-card-border -mx-1 px-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`shrink-0 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
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
