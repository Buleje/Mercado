"use client";

import { X, Building2, Loader2, KeyRound, ShoppingBag, Pencil, Check, Activity, StickyNote, MessageSquare, ShieldCheck, HeartPulse } from "@buleje/design-system/icons";
import Link from "next/link";
import { useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import type { TenantRow } from "@/lib/superadmin-types";
import { PlanBadge, StatusBadge } from "@/components/superadmin/_shared";
import { TenantHealthTab } from "@/components/superadmin/tenants/TenantHealthTab";
import type { TabDetalle } from "@/components/superadmin/tenants/tenant-detalle-shared";
import { useTenantDetalle } from "@/components/superadmin/tenants/useTenantDetalle";
import { TenantDetalleResumen } from "@/components/superadmin/tenants/TenantDetalleResumen";
import { TenantDetalleSeguridad } from "@/components/superadmin/tenants/TenantDetalleSeguridad";
import { TenantDetalleUso, TenantDetalleFacturacion, TenantDetalleActividad, TenantDetalleNotas } from "@/components/superadmin/tenants/TenantDetallePestanas";

interface TenantDetailModalProps {
  tenant: TenantRow;
  onClose: () => void;
  /** Refresca la lista del padre tras un inline edit / extend trial. */
  onUpdated?: () => void;
}

export function TenantDetailModal({ tenant, onClose, onUpdated }: TenantDetailModalProps) {
  const t = tenant;
  const d = useTenantDetalle(t, onUpdated);
  const { tab, setTab, editing, setEditing, nameInput, setNameInput, emailInput, setEmailInput, savingEdit, handleSaveEdit } = d;
  const cancelarEdicion = () => {
    setEditing(false);
    setNameInput(t.name);
    setEmailInput(t.ownerEmail ?? "");
  };
  // Modal a mano: foco adentro, Tab atrapado y el foco vuelve a quien lo abrió.
  // Escape con el nombre/email abiertos sólo cancela la edición (no tira lo escrito
  // cerrando la ficha); sin edición, cierra.
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: () => (editing ? cancelarEdicion() : onClose()) });

  const TABS: { id: TabDetalle; label: string; icon: typeof Activity }[] = [
    { id: "resumen", label: "Resumen", icon: Building2 },
    { id: "salud", label: "Salud", icon: HeartPulse },
    { id: "uso", label: "Uso", icon: KeyRound },
    { id: "facturacion", label: "Facturación", icon: ShoppingBag },
    { id: "seguridad", label: "Seguridad", icon: ShieldCheck },
    { id: "actividad", label: "Actividad", icon: Activity },
    { id: "notas", label: "Notas", icon: StickyNote },
  ];

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- backdrop modal (cierra al click; Escape lo cierra useModalAccesible)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- contenedor del modal: stopPropagation, no interactivo */}
      <div
        ref={cajaRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${t.name}`}
        tabIndex={-1}
        className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[var(--shadow-xl)] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con inline edit */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--rule-base)]">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full h-9 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="email del dueño"
                  className="w-full h-8 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-sm text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 h-8 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {savingEdit ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}{" "}
                    Guardar
                  </button>
                  <button
                    onClick={cancelarEdicion}
                    className="rounded-lg px-3 h-8 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* El lápiz va AL LADO del título, nunca dentro (ley de la vista). */}
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2 min-w-0">
                    <Building2 className="w-5 h-5 text-[var(--accent)] shrink-0" aria-hidden="true" />
                    <span className="truncate">{t.name}</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    title="Editar nombre / email"
                    aria-label="Editar nombre y email"
                    className="text-[var(--text-tertiary)] hover:text-[var(--accent)] shrink-0"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] text-xs mt-1 font-mono">
                  {t.slug}
                </p>
                {t.ownerEmail && (
                  <p className="text-[var(--text-tertiary)] text-xs mt-0.5 truncate">
                    {t.ownerEmail}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <PlanBadge plan={t.plan} />
            <StatusBadge active={t.active} />
            <Link
              href={`/superadmin/tenants/${t.slug}`}
              title="Ficha 360 del negocio"
              className="inline-flex h-8 items-center rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--accent)] hover:bg-primary/10"
            >
              Ficha 360
            </Link>
            <Link
              href={`/superadmin/chat?tenant=${t.id}&name=${encodeURIComponent(t.name)}`}
              title="Chatear con este negocio"
              className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-primary/10"
            >
              <MessageSquare className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar (Esc)"
              className="p-1 rounded-xl hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-3 pt-3 border-b border-[var(--rule-base)] overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${tab === id ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === "resumen" && <TenantDetalleResumen t={t} d={d} />}

          {tab === "salud" && <TenantHealthTab slug={t.slug} />}

          {tab === "uso" && <TenantDetalleUso t={t} />}

          {tab === "facturacion" && <TenantDetalleFacturacion t={t} />}

          {tab === "seguridad" && <TenantDetalleSeguridad d={d} />}

          {tab === "actividad" && <TenantDetalleActividad activity={d.activity} />}

          {tab === "notas" && <TenantDetalleNotas d={d} />}
        </div>
      </div>
    </div>
  );
}
