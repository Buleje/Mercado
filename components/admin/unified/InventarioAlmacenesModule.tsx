"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const InventoryTab = dynamic(() => import("@/components/admin/InventoryTab"), { loading: S });
const KardexTab = dynamic(() => import("@/components/admin/KardexTab"), { loading: S });
const BatchesTab = dynamic(() => import("@/components/admin/BatchesTab"), { loading: S });
const PhysicalInventoryTab = dynamic(() => import("@/components/admin/PhysicalInventoryTab"), { loading: S });
const ShrinkageTab = dynamic(() => import("@/components/admin/ShrinkageTab"), { loading: S });
const WarehouseTab = dynamic(() => import("@/components/admin/WarehouseTab"), { loading: S });
const WarehouseLocationTab = dynamic(() => import("@/components/admin/WarehouseLocationTab"), { loading: S });
const WarehouseTransferTab = dynamic(() => import("@/components/admin/WarehouseTransferTab"), { loading: S });

const TABS = [
  { id: "stock" as const, label: "Stock" },
  { id: "kardex" as const, label: "Kardex" },
  { id: "lotes" as const, label: "Lotes y Vcto" },
  { id: "fisico" as const, label: "Inv. Físico" },
  { id: "mermas" as const, label: "Mermas" },
  { id: "almacenes" as const, label: "Almacenes" },
  { id: "ubicaciones" as const, label: "Ubicaciones" },
  { id: "transferencias" as const, label: "Transferencias" },
];

export default function InventarioAlmacenesModule() {
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
      {sub === "stock" && <InventoryTab />}
      {sub === "kardex" && <KardexTab />}
      {sub === "lotes" && <BatchesTab />}
      {sub === "fisico" && <PhysicalInventoryTab />}
      {sub === "mermas" && <ShrinkageTab />}
      {sub === "almacenes" && <WarehouseTab />}
      {sub === "ubicaciones" && <WarehouseLocationTab />}
      {sub === "transferencias" && <WarehouseTransferTab />}
    </div>
  );
}
