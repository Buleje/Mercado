"use client";

import { activateProps } from "@/components/admin/shared/a11y";
import Image from "next/image";
import { Trash2, Loader2, Send, TrendingUp, Target, Pencil, Gift, Eye, EyeOff, Sparkles, BadgePercent, MoreHorizontal } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ActionMenu from "@/components/admin/shared/action-menu";
import { formatDate, formatNumber } from "@/lib/format";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

/** Lista de promociones (o su estado vacío). Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function PromocionesLista({ prm }: { prm: Promociones }) {
  const {
    promos, loading, setShowAiModal, setAiContext, setConfirmDeleteId, setDetailPromo,
    openEdit, toggleActive, requestAiSuggestions, openSendModal, promoMetrics,
  } = prm;
  return (
    <>
      {loading ? (
        <div className="flex h-40 items-center justify-center text-[var(--text-tertiary)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando…
        </div>
      ) : promos.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-4">
          <Gift className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">Aún no tienes ofertas: crea la primera y mándala por WhatsApp.</p>
          <button
            onClick={() => { setAiContext(""); setShowAiModal(true); requestAiSuggestions(); }}
            className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Pedir ideas a la IA
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {promoMetrics.map(p => {
            const targetLabel = p.targetType === "all" ? "Todos"
              : p.targetType === "group" ? "Grupo"
              : p.targetType === "individual" ? "Individual"
              : p.targetType === "specific" ? "Segmentado" : "Todos";
            return (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-shadow hover:shadow-[var(--shadow-sm)]">
              <div className="flex">
                {/* Accent strip por estado */}
                <div className={cn("w-1.5 shrink-0", p.active ? "bg-[var(--accent)]" : "bg-[var(--rule-base)]")} />
                <div className="min-w-0 flex-1">
                  <div
                    className="cursor-pointer p-4 transition-colors hover:bg-[var(--surface-sunken)]/40"
                    {...activateProps(() => setDetailPromo(p))}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      {/* Image preview */}
                      {p.imageUrl && (
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
                          <Image src={p.imageUrl} alt={p.name} fill className="object-cover" sizes="56px" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)]">{p.name}</span>
                          <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-sm font-bold",
                            p.active ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                          )}>
                            {p.active ? "Activa" : "Inactiva"}
                          </span>
                          {p.discountPercent > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--data-error-50)] px-2.5 py-0.5 text-sm font-bold text-[var(--data-error-700)]">
                              <BadgePercent className="h-3 w-3" /> {p.discountPercent}% OFF
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-sm font-bold text-[var(--text-secondary)]">
                            <Target className="h-3 w-3" /> {targetLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-secondary)]">{p.description}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-tertiary)]">
                          <span>Creada {formatDate(p.createdAt)}</span>
                          {p.expiresAt && <span>· Expira {formatDate(p.expiresAt)}</span>}
                          <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
                            <TrendingUp className="h-3.5 w-3.5" /> ~{p.estimatedUses} usos
                          </span>
                          <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
                            <BadgePercent className="h-3.5 w-3.5" /> ~S/{formatNumber(p.estimatedRevenue, { max: 0 })} est.
                          </span>
                        </div>
                      </div>
                      {/* Acciones: la principal a 48 px y el resto en «⋯» */}
                      <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openSendModal(p)}
                          className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
                          title="Enviar por WhatsApp"
                        >
                          <Send className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Enviar</span>
                        </button>
                        <ActionMenu
                          label={`Más acciones de ${p.name}`}
                          soloIcono
                          size="md"
                          className="w-12 shrink-0"
                          icon={MoreHorizontal}
                          actions={[
                            { id: "editar", label: "Editar", icon: Pencil, onSelect: () => openEdit(p) },
                            { id: "activar", label: p.active ? "Desactivar" : "Activar", hint: p.active ? "La tienda deja de mostrarla" : "La tienda vuelve a mostrarla", icon: p.active ? EyeOff : Eye, onSelect: () => toggleActive(p) },
                            { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: () => setConfirmDeleteId(p.id) },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </>
  );
}
