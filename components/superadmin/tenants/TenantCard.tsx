"use client";

import { useState } from "react";
import type { TenantRow } from "@/lib/superadmin-types";
import { PendingOrdersModal } from "./PendingOrdersModal";
import { datosDeTarjeta } from "@/components/superadmin/tenants/tenant-card-datos";
import { TenantCardSenales } from "@/components/superadmin/tenants/TenantCardSenales";
import { TenantCardCifras } from "@/components/superadmin/tenants/TenantCardCifras";
import { TenantCardAcciones } from "@/components/superadmin/tenants/TenantCardAcciones";

export interface TenantCardProps {
  tenant: TenantRow;
  /** Salud calculada en la page — se muestra integrada en el kicker (antes era un badge absoluto superpuesto). */
  health?: "healthy" | "warning" | "critical";
  onDetail: (t: TenantRow) => void;
  onInvite: (slug: string, name: string) => void;
  onToggleActive: (slug: string, active: boolean) => void;
  actionLoading: string | null;
  onImpersonate: (slug: string) => void;
  onToggleMarketplace: (tenant: TenantRow) => void;
  onLoginAs: (tenant: TenantRow) => void;
  onDelete: (slug: string, name: string) => void;
  onPurge: (slug: string, name: string) => void;
  onViewProducts?: (tenant: TenantRow) => void;
  onAddProduct?: (tenant: TenantRow) => void;
}

export function TenantCard({
  tenant,
  health: healthProp,
  onDetail,
  onInvite,
  onToggleActive,
  actionLoading,
  onImpersonate,
  onToggleMarketplace,
  onLoginAs,
  onDelete,
  onPurge,
  onViewProducts,
  onAddProduct,
}: TenantCardProps) {
  const t = tenant;
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  // Snapshot Date.now() en mount — evita re-render storms y satisface la
  // regla react-hooks/purity (Date.now en render = impuro).
  const [now] = useState(() => Date.now());
  const datos = datosDeTarjeta(t, now);

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl shadow-[var(--shadow-sm)] hover:border-[var(--rule-strong)] transition-colors overflow-hidden">
      {/* Brandon 2026-05-21 fix mobile: p-4 sm:p-5 — 16px lateral en mobile
          (de 20px) gana ~8px de ancho interno para los KPIs 4-col. */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* Kicker — Brandon 2026-06-05 desaturación: antes acá vivían hasta
            5 badges en flex-wrap (pendientes/trial/Enterprise/Marketplace/
            Admin/problemas) y ADEMÁS la page montaba un badge de salud
            `absolute top-3 right-3` encima → se pisaban entre sí.
            Ahora: fila 1 = plan + salud (1 solo pill, integrado). El resto
            de señales baja a una fila de chips uniforme bajo el nombre. */}
        <TenantCardSenales t={t} datos={datos} healthProp={healthProp} setPendingModalOpen={setPendingModalOpen} />

        <TenantCardCifras t={t} datos={datos} onViewProducts={onViewProducts} />

        <TenantCardAcciones
          t={t}
          isOnMarketplace={datos.isOnMarketplace}
          hasStore={datos.hasStore}
          onDetail={onDetail}
          onInvite={onInvite}
          onToggleActive={onToggleActive}
          actionLoading={actionLoading}
          onImpersonate={onImpersonate}
          onToggleMarketplace={onToggleMarketplace}
          onLoginAs={onLoginAs}
          onDelete={onDelete}
          onPurge={onPurge}
          onAddProduct={onAddProduct}
        />
      </div>

      {pendingModalOpen && (
        <PendingOrdersModal
          tenantSlug={t.slug}
          tenantName={t.name}
          onClose={() => setPendingModalOpen(false)}
        />
      )}
    </div>
  );
}
