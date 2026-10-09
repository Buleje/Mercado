"use client";

import { Plus, Trash2, Check, Loader2, ExternalLink, Send, Calendar, Target, Play, Pause, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateTime } from "@/lib/format";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

/** Bloque de campañas programadas. Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function CampanasProgramadas({ prm }: { prm: Promociones }) {
  const {
    campaigns, sendingCampaignId, campaignFeedback, openCreateCampaign, openEditCampaign,
    toggleCampaignStatus, deleteCampaign, sendCampaignNow,
  } = prm;
  return (
    <>
      {/* ── Campañas programadas: título + ⓘ, su propia acción y la lista ── */}
      <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Campañas programadas</CardTitle>
          <InfoTip
            title="Campañas programadas"
            what="Un aviso con nombre, grupo de clientes, fechas y código de descuento. «Enviar ahora» manda una notificación en la app a los clientes de ese grupo que aceptan promociones."
            affects="Se guardan sólo en este navegador: en otra PC o en el celular no aparecen. El «Auto-envío» todavía no sale solo; usa «Enviar ahora»."
            example="«Fiestas Patrias» para tus clientes oro y diamante del domingo 20/07 al martes 29/07 con el código PATRIA12."
          />
          <button
            type="button"
            onClick={openCreateCampaign}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <Plus className="h-4 w-4" aria-hidden /> Nueva campaña
          </button>
        </div>

        {campaigns.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Clock className="h-4 w-4" aria-hidden /> No hay campañas programadas.
          </p>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => {
              const statusConfig = {
                scheduled: { label: "Programada", color: "bg-[var(--rule-soft)] text-[var(--text-primary)]", icon: Clock },
                active: { label: "Activa", color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", icon: Play },
                completed: { label: "Finalizada", color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", icon: Check },
                paused: { label: "Pausada", color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", icon: Pause },
              };
              const config = statusConfig[c.status];
              const StatusIcon = config.icon;

              return (
                <div key={c.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{c.name}</span>
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold", config.color)}>
                          <StatusIcon className="h-3 w-3" /> {config.label}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--surface-sunken)] text-[var(--text-primary)]">
                          <Target className="h-3 w-3" /> {c.targetSegment.charAt(0).toUpperCase() + c.targetSegment.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] dark:text-muted mb-2">{c.description || "Sin descripción"}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-tertiary)] dark:text-muted">
                        <span>Inicio: {formatDateTime(c.startDate)}</span>
                        {c.endDate && <span>Fin: {formatDateTime(c.endDate)}</span>}
                        {c.discountCode && <span className="font-mono font-bold text-[var(--data-success-500)]">Código: {c.discountCode}</span>}
                        {c.autoSend && <span className="inline-flex items-center gap-1 text-[var(--data-success-500)]"><Send className="h-3.5 w-3.5" aria-hidden /> Auto-envío</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.status !== "completed" && (
                        <>
                          <button
                            onClick={() => sendCampaignNow(c)}
                            disabled={sendingCampaignId === c.id}
                            className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-primary/10 disabled:opacity-50 transition-colors"
                            title="Enviar ahora"
                          >
                            {sendingCampaignId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => toggleCampaignStatus(c.id)}
                            className={cn("p-1.5 rounded-xl transition-colors",
                              c.status === "paused" ? "text-[var(--data-success-500)] hover:bg-primary/10" : "text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)]"
                            )}
                            title={c.status === "paused" ? "Reanudar" : "Pausar"}
                          >
                            {c.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => openEditCampaign(c)}
                        className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-primary/10 transition-colors"
                        title="Editar"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteCampaign(c.id)}
                        className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {campaignFeedback?.id === c.id && (
                    <p className={cn("mt-2 text-xs font-semibold", campaignFeedback.ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                      {campaignFeedback.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
