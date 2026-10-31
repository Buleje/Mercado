"use client";

import { ExternalLink, Mail, XCircle, CheckCircle2, Loader2, ArrowDownRight, ArrowUpRight, Package, Store, ShoppingBag, BarChart3, Trash2, Eraser, LogIn } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { esTenantProtegido } from "@/lib/tenancy/negocio-por-defecto";
import type { TenantCardProps } from "@/components/superadmin/tenants/TenantCard";

type TenantCardAccionesProps = Omit<TenantCardProps, "tenant" | "health" | "onViewProducts"> & {
  t: TenantRow;
  isOnMarketplace: boolean;
  hasStore: boolean;
};

/** Botonera de la tarjeta: tienda/panel, agregar producto, marketplace/login y acciones de cuenta. */
export function TenantCardAcciones({
  t, isOnMarketplace, hasStore, onDetail, onInvite, onToggleActive, actionLoading,
  onImpersonate, onToggleMarketplace, onLoginAs, onDelete, onPurge, onAddProduct,
}: TenantCardAccionesProps) {
  return (
    <>
        {/* Row 1: Tienda + Panel Admin — Brandon 2026-05-21 high-impact.
            Panel Admin es LA acción principal del superadmin (impersona el
            panel del tenant). Antes: igual peso visual que "Ir a Tienda".
            Ahora:
            · Panel Admin: gradient + altura mayor (h-11 vs h-9) + icono
              full-stroke + texto bold (CTA primario obvio)
            · Ir a Tienda: outline subtle (acción secundaria de preview) */}
        <div className="flex gap-2 pt-1 border-t border-[var(--rule-base)]">
          <a
            href={`/tienda`}
            onClick={(e) => {
              e.preventDefault();
              window.open(`/t/${t.slug}/tienda`, "_blank");
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg text-xs font-semibold border border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Abrir el storefront público del tenant en otra pestaña"
          >
            <Store className="w-3.5 h-3.5" /> Ir a Tienda
          </a>
          <button
            type="button"
            onClick={() => onImpersonate(t.slug)}
            className="flex-[1.5] inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-md)]"
            style={{
              background:
                "linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent) 75%, black))",
            }}
            title="Impersonar el panel admin de este tenant"
            aria-label={`Abrir panel admin de ${t.name}`}
          >
            <ExternalLink className="w-4 h-4" strokeWidth={2.5} /> Panel Admin
          </button>
        </div>

        {/* Row CTA: Agregar producto desde superadmin (con modifiers) */}
        {onAddProduct && (
          <button
            type="button"
            onClick={() => onAddProduct(t)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 border-dashed border-[var(--accent)]/40 text-[var(--accent)] hover:bg-primary/10 transition-colors"
          >
            <Package className="w-4 h-4" /> Agregar producto a esta tienda
          </button>
        )}

        {/* Row 2: Marketplace + Login — outline neutros */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onToggleMarketplace(t)}
            disabled={actionLoading === `${t.slug}-marketplace`}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--rule-base)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === `${t.slug}-marketplace` ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isOnMarketplace ? (
              <>
                <ArrowDownRight className="w-3.5 h-3.5" /> Dar de baja
              </>
            ) : hasStore ? (
              <>
                <ArrowUpRight className="w-3.5 h-3.5" /> Subir a Marketplace
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" /> Sin tienda
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => onLoginAs(t)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--rule-base)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" /> Iniciar sesión
          </button>
        </div>

        {/* Row 3 — Brandon 2026-05-21 fix mobile: separamos botones con
            label (Invitar/Suspender) de los icon-only (Purge/Delete/Detail).
            Mobile: 2+3 stack (2 botones full text arriba, 3 icons compactos
            abajo). Desktop: 5 en 1 fila como antes. Tap targets h-10 mobile. */}
        <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2">
          {/* Sub-fila 1: botones con label (full text) */}
          <div className="grid grid-cols-2 sm:flex-1 sm:flex sm:gap-2 gap-2">
            <button
              type="button"
              onClick={() => onInvite(t.slug, t.name)}
              className="sm:flex-1 inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 rounded-xl text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Invitar usuario"
            >
              <Mail className="w-3.5 h-3.5" /> Invitar
            </button>
            <button
              type="button"
              onClick={() => onToggleActive(t.slug, t.active)}
              disabled={actionLoading === `${t.slug}-active`}
              className="sm:flex-1 inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 rounded-xl text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              aria-label={t.active ? "Suspender tienda" : "Activar tienda"}
            >
              {actionLoading === `${t.slug}-active` ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : t.active ? (
                <>
                  <XCircle className="w-3.5 h-3.5" /> Suspender
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Activar
                </>
              )}
            </button>
          </div>
          {/* Sub-fila 2: 3 icon-only botones — tap targets h-10 mobile */}
          <div className="grid grid-cols-3 sm:flex gap-2">
            <button
              type="button"
              onClick={() => onPurge(t.slug, t.name)}
              disabled={actionLoading === `${t.slug}-purge`}
              className="inline-flex items-center justify-center h-10 w-full sm:w-10 sm:h-9 rounded-xl text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              title="Limpiar datos de esta tienda (productos, pedidos, movimientos)"
              aria-label="Limpiar datos"
            >
              {actionLoading === `${t.slug}-purge` ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eraser className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onDelete(t.slug, t.name)}
              disabled={actionLoading === `${t.slug}-delete` || esTenantProtegido(t.slug)}
              className="inline-flex items-center justify-center h-10 w-full sm:w-10 sm:h-9 rounded-xl text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-500)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={
                esTenantProtegido(t.slug) ? "No se puede eliminar la tienda principal" : "Eliminar tienda"
              }
              aria-label="Eliminar tienda"
            >
              {actionLoading === `${t.slug}-delete` ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onDetail(t)}
              className="inline-flex items-center justify-center h-10 w-full sm:w-10 sm:h-9 rounded-xl text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
              title="Ver detalle / analytics"
              aria-label="Ver detalle"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
    </>
  );
}
