"use client";

import { useRef } from "react";
import { X } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import type { TenantRow } from "@/lib/superadmin-types";
import { TenantCard, type TenantCardProps } from "@/components/superadmin/tenants/TenantCard";

interface TenantCardModalProps {
  tenant: TenantRow;
  health: "healthy" | "warning" | "critical";
  acciones: Omit<TenantCardProps, "tenant" | "health">;
  onClose: () => void;
}

/** Tarjeta completa de una tienda (cifras, uso, correo y todas las acciones) en una ventana. */
export function TenantCardModal({ tenant, health, acciones, onClose }: TenantCardModalProps) {
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: onClose });

  // Lo que abre otra ventana cierra esta primero: no se apilan dos.
  const cerrandoAntes = {
    ...acciones,
    onDetail: (t: TenantRow) => { onClose(); acciones.onDetail(t); },
    onInvite: (s: string, n: string) => { onClose(); acciones.onInvite(s, n); },
    onDelete: (s: string, n: string) => { onClose(); acciones.onDelete(s, n); },
    onPurge: (s: string, n: string) => { onClose(); acciones.onPurge(s, n); },
    onViewProducts: acciones.onViewProducts && ((t: TenantRow) => { onClose(); acciones.onViewProducts?.(t); }),
    onAddProduct: acciones.onAddProduct && ((t: TenantRow) => { onClose(); acciones.onAddProduct?.(t); }),
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- fondo del modal: cierra al clic; Escape lo cierra useModalAccesible
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- contenedor: stopPropagation, no interactivo */}
      <div
        ref={cajaRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalles de ${tenant.name}`}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-base)] px-4 py-3">
          <h2 className="min-w-0 truncate text-base font-bold text-[var(--text-primary)]">{tenant.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TenantCard tenant={tenant} health={health} {...cerrandoAntes} />
        </div>
      </div>
    </div>
  );
}
