"use client";

import ActionMenu from "@/components/admin/shared/action-menu";
import { Download, UserPlus, BarChart3 } from "@buleje/design-system/icons";
import { exportToCSV } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import { formatDateNumeric } from "@/lib/format";
import { BotonRestablecerColumnas } from "@/components/admin/shared/columnas-ordenables";
import type { Crm } from "@/components/admin/crm/use-crm";

/** «Nuevo cliente», el menú «Más» (descargas y comparar) y restablecer columnas; va al final de la cabecera. Pieza de CRMTab: recibe `useCrm` entero. */
export default function CrmBarra({ crm }: { crm: Crm }) {
  const {
    customers, setShowNewClientModal, compareMode, setCompareMode, setComparePhones, orden, filtered,
  } = crm;
  return (
    <>
      {/* ── Toolbar: acciones del módulo (header lo da el padre CRMClientesModule) ─ */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowNewClientModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <UserPlus className="h-4 w-4" /> Nuevo cliente
        </button>
        {/* CSV, Excel y Comparar se usan de vez en cuando: al menú (ley de Brandon 2026-10-01). */}
        <ActionMenu
          label="Más"
          size="md"
          soloIcono
          actions={[
            {
              id: "csv",
              label: "Descargar CSV",
              hint: "Todos los clientes, para abrir en cualquier programa",
              icon: Download,
              onSelect: () =>
                exportToCSV(
                  customers.map(c => ({ nombre: c.name, teléfono: c.phone, ubicacion: c.location ?? "", gastado: c.totalSpent ?? 0, segmento: c._segment ?? "nuevo" })),
                  "crm-clientes"
                ),
            },
            {
              id: "excel",
              label: "Descargar Excel",
              hint: "Sólo los clientes que ves con los filtros de ahora",
              icon: Download,
              onSelect: () => {
                if (filtered.length === 0) return;
                const rows = filtered.map(c => ({
                  Nombre: c.name,
                  "Teléfono": c.phone,
                  "Categoría": c.loyaltyTier ?? "—",
                  Tags: (c._tags ?? []).join(", ") || "—",
                  "Total gastado (S/)": Number((c.totalSpent ?? 0).toFixed(2)),
                  "Última compra": c._lastOrder ? formatDateNumeric(c._lastOrder) : "Sin compras",
                  Estado: c._segment === "frecuente" ? "Frecuente" : c._segment === "ocasional" ? "Ocasional" : c._segment === "perdido" ? "Perdido" : "Nuevo",
                }));
                const fecha = new Date().toISOString().slice(0, 10);
                exportToExcel(rows, `clientes-${fecha}`, "Clientes");
              },
            },
            {
              id: "comparar",
              label: compareMode ? "Salir de comparar" : "Comparar clientes",
              hint: "Elige dos o más y míralos lado a lado",
              icon: BarChart3,
              activo: compareMode,
              onSelect: () => { setCompareMode(!compareMode); if (compareMode) { setComparePhones(new Set()); } },
            },
          ]}
        />
        <BotonRestablecerColumnas cambiado={orden.cambiado} onRestablecer={orden.restablecer} />
      </div>
    </>
  );
}
