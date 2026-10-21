"use client";

import { useId, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import type { TenantRow } from "@/lib/superadmin-types";
import { TenantHealthTab } from "@/components/superadmin/tenants/TenantHealthTab";
import type { TabDetalle } from "@/components/superadmin/tenants/tenant-detalle-shared";
import { useTenantDetalle } from "@/components/superadmin/tenants/useTenantDetalle";
import { TenantDetalleCabecera } from "@/components/superadmin/tenants/TenantDetalleCabecera";
import { TenantDetalleNav, etiquetaDeTab } from "@/components/superadmin/tenants/TenantDetalleNav";
import { TenantDetalleResumen } from "@/components/superadmin/tenants/TenantDetalleResumen";
import { TenantDetalleAvisos } from "@/components/superadmin/tenants/TenantDetalleAvisos";
import { TenantDetalleSeguridad } from "@/components/superadmin/tenants/TenantDetalleSeguridad";
import { TenantDetalleCredenciales } from "@/components/superadmin/tenants/TenantDetalleCredenciales";
import { TenantDetalleUso, TenantDetalleFacturacion, TenantDetalleActividad, TenantDetalleNotas } from "@/components/superadmin/tenants/TenantDetallePestanas";

interface TenantDetailModalProps {
  tenant: TenantRow;
  onClose: () => void;
  /** Refresca la lista del padre tras un inline edit / extend trial / avisos. */
  onUpdated?: () => void;
  /** Pestaña con que abre (p. ej. «credenciales» al llegar por el candado cerrado). */
  tabInicial?: TabDetalle;
  /** «Panel admin» con la suplantación de la página (toasts + candado). Sin esto, la ficha suplanta sola. */
  onImpersonate?: (slug: string) => void | Promise<void>;
}

/** Punto en la pestaña «Avisos por correo» cuando no salen (sin correo o pausados). */
function avisoDeAvisos(t: TenantRow): Partial<Record<TabDetalle, string>> | undefined {
  const a = t.avisosCorreo;
  if (!a) return undefined;
  if (!a.correo?.trim()) return { avisos: "sin correo" };
  if (a.pausado) return { avisos: "pausados" };
  return undefined;
}

export function TenantDetailModal({ tenant, onClose, onUpdated, tabInicial, onImpersonate }: TenantDetailModalProps) {
  const t = tenant;
  const d = useTenantDetalle(t, onUpdated, tabInicial);
  const { tab, setTab, editing, setEditing, setNameInput, setEmailInput, setEnfocarCorreo } = d;
  const cancelarEdicion = () => {
    setEditing(false);
    setEnfocarCorreo(false);
    setNameInput(t.name);
    setEmailInput(t.ownerEmail ?? "");
  };
  // Modal a mano: foco adentro, Tab atrapado y el foco vuelve a quien lo abrió.
  // Escape con el nombre/email abiertos sólo cancela la edición (no tira lo escrito
  // cerrando la ficha); sin edición, cierra.
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: () => (editing ? cancelarEdicion() : onClose()) });
  const tituloId = useId();

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- backdrop modal (cierra al click; Escape lo cierra useModalAccesible)
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- contenedor del modal: stopPropagation, no interactivo */}
      <div
        ref={cajaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={editing ? undefined : tituloId}
        aria-label={editing ? `Ficha de ${t.name}` : undefined}
        tabIndex={-1}
        // Alto FIJO: cambiar de pestaña no hace saltar la ventana.
        className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] outline-none sm:h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <TenantDetalleCabecera t={t} d={d} tituloId={tituloId} onClose={onClose} cancelarEdicion={cancelarEdicion} onImpersonate={onImpersonate} />

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <TenantDetalleNav tab={tab} setTab={setTab} conAviso={avisoDeAvisos(t)} />

          <section aria-label={etiquetaDeTab(tab)} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {tab === "resumen" && <TenantDetalleResumen t={t} d={d} />}
            {tab === "salud" && <TenantHealthTab slug={t.slug} />}
            {tab === "uso" && <TenantDetalleUso t={t} />}
            {tab === "facturacion" && <TenantDetalleFacturacion t={t} />}
            {tab === "avisos" && (
              <TenantDetalleAvisos slug={t.slug} onEditarCorreo={d.editarCorreo} onUpdated={onUpdated} recargarCon={d.guardados} />
            )}
            {tab === "seguridad" && <TenantDetalleSeguridad d={d} />}
            {tab === "credenciales" && <TenantDetalleCredenciales t={t} />}
            {tab === "actividad" && <TenantDetalleActividad activity={d.activity} />}
            {tab === "notas" && <TenantDetalleNotas d={d} />}
          </section>
        </div>
      </div>
    </div>
  );
}
