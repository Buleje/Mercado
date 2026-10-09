"use client";

import { CardTitle } from "@buleje/design-system";
import { Check, Sparkles, Settings, Calendar } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { ruleConfigs } from "@/components/admin/cupones/cupones-compartido";
import type { Cupones } from "@/components/admin/cupones/hooks/use-cupones";

/** Reglas automáticas e historial de cupones auto-generados. Pieza de CouponsTab: recibe `useCupones` entero. */
export default function CuponesReglas({ cup }: { cup: Cupones }) {
  const {
    autoRules, generatedLogs, toggleRule, openRuleConfig,
  } = cup;
  return (
    <>
      {/* ── Reglas automáticas: título + ⓘ (la plantilla de código pasó a «Más acciones» de la cabecera) ── */}
      <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Reglas automáticas</CardTitle>
          <InfoTip
            title="Reglas automáticas"
            what="Cupones que se arman solos por un motivo: cumpleaños, primera compra, cliente que dejó de venir, gasto acumulado o referido. Con «Configurar» eliges el descuento y cuántos días vale."
            affects="Estas reglas se guardan sólo en este navegador y todavía no crean cupones. Los que el sistema ya crea solo van aparte y salen en la lista de arriba: BIENVENIDO 10 % en la primera compra, CUMPLEAÑOS 15 % y FIEL 20 % en la 10.ª compra."
            example="Cumpleaños: 10 % por 7 días; el cliente que cumple el jueves 16/10 recibiría un código como BDAY1016K7Q."
          />
        </div>

        <div className="space-y-2">
          {autoRules.map(rule => {
            const config = ruleConfigs[rule.type];
            const Icon = config.icon;
            return (
              <div key={rule.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--text-primary)] flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-[var(--surface-canvas)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{config.label}</span>
                      {rule.enabled && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                          <Check className="h-3 w-3" /> Activa
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{config.desc}</p>
                    {rule.enabled && (
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">
                        {rule.config.discountType === "percent" ? `${rule.config.discountValue}%` : `S/${rule.config.discountValue}`} descuento
                        {rule.config.validityDays && ` · ${rule.config.validityDays} días validez`}
                        {rule.config.autoSend && " · Auto-envío"}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => openRuleConfig(rule)}
                      className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-primary/10 transition-colors"
                      title="Configurar"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <label aria-label={`${config.label}: ${rule.enabled ? "activa" : "inactiva"}`} className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule.id)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-[var(--rule-soft)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Cupones Generados Automáticamente ─────────────────────────────── */}
      {generatedLogs.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4 flex flex-wrap items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Historial de cupones auto-generados
          </CardTitle>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {generatedLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between p-3 bg-[var(--surface-alt)] rounded-xl text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{log.customer}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">
                    {log.ruleType} · {formatDate(log.date)} · <span className="font-mono font-bold text-primary">{log.couponCode}</span>
                  </p>
                </div>
                <span className={cn("inline-flex px-2 py-1 rounded-full text-xs font-bold",
                  log.status === "sent" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" :
                  log.status === "used" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                )}>
                  {log.status === "sent" ? "Enviado" : log.status === "used" ? "Usado" : "Pendiente"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
