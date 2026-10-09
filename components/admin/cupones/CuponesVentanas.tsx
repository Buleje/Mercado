"use client";

import { CardTitle } from "@buleje/design-system";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X, Copy, MessageCircle } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { ruleConfigs } from "@/components/admin/cupones/cupones-compartido";
import type { Cupones } from "@/components/admin/cupones/hooks/use-cupones";

/** Ventanas de configurar regla, enviar por WhatsApp y plantilla de código. Pieza de CouponsTab: recibe `useCupones` entero. */
export default function CuponesVentanas({ cup }: { cup: Cupones }) {
  const {
    editingRule, setEditingRule, showRuleConfig, setShowRuleConfig, showTemplateBuilder,
    setShowTemplateBuilder, templatePattern, setTemplatePattern, whatsappCoupon, setWhatsappCoupon,
    whatsappPhone, setWhatsappPhone, cajaRegla, ventanaRegla, cajaWhatsapp, ventanaWhatsapp,
    cajaPlantilla, ventanaPlantilla, saveRuleConfig, generateTestCoupon, buildWhatsappMsg,
    sendWhatsapp, copyWhatsappMsg,
  } = cup;
  return (
    <>
      {/* ── Rule Configuration Modal ──────────────────────────────────────── */}
      {showRuleConfig && editingRule && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 100 }} onClick={() => { if (!ventanaRegla.fijado) setShowRuleConfig(false); }}>
          <div ref={cajaRegla} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Configurar regla" className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div>
                <CardTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Configurar Regla</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{ruleConfigs[editingRule.type].label}</p>
              </div>
              <div className="flex items-center gap-1"><ControlesDeVentana ventana={ventanaRegla} />
              <button aria-label="Cerrar" onClick={() => setShowRuleConfig(false)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors">
                <X className="h-5 w-5" />
              </button></div>
            </div>
            <div className="px-5 py-4 space-y-4">
              <Field label="Tipo de descuento" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <select value={editingRule.config.discountType} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, discountType: e.target.value as "percent" | "fixed" } })}
                  className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary bg-[var(--surface-raised)] ">
                  <option value="percent">Porcentaje (%)</option>
                  <option value="fixed">Monto fijo (S/)</option>
                </select>
              </Field>
              <Field label="Valor del descuento" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <input type="number" value={editingRule.config.discountValue} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, discountValue: Number(e.target.value) } })}
                  className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" />
              </Field>
              {editingRule.type !== "min-spend" && (
                <Field label="Días de validez" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="number" value={editingRule.config.validityDays} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, validityDays: Number(e.target.value) } })}
                    className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" />
                </Field>
              )}
              {editingRule.type === "inactive" && (
                <Field label="Días de inactividad antes de activar" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="number" value={editingRule.config.inactiveDays} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, inactiveDays: Number(e.target.value) } })}
                    className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" />
                </Field>
              )}
              {editingRule.type === "min-spend" && (
                <Field label="Gasto mínimo acumulado (S/)" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="number" value={editingRule.config.minSpend} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, minSpend: Number(e.target.value) } })}
                    className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" />
                </Field>
              )}
              <div className="flex flex-wrap items-center gap-3 p-3 bg-[var(--surface-alt)] rounded-xl">
                <input type="checkbox" id="ruleAutoSend" checked={editingRule.config.autoSend} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, autoSend: e.target.checked } })}
                  className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                <label htmlFor="ruleAutoSend" className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] cursor-pointer flex-1">
                  Enviar automáticamente por WhatsApp
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-3">
              <button onClick={() => setShowRuleConfig(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--surface-sunken)] dark:bg-accent hover:bg-[var(--rule-soft)] transition-colors">Cancelar</button>
              <button onClick={saveRuleConfig} className="flex-1 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors">Guardar</button>
            </div>
            <TiradorDeVentana ventana={ventanaRegla} />
          </div>
        </div>
      )}

      {/* ── WhatsApp Send Modal ──────────────────────────────────────────── */}
      {whatsappCoupon && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 100 }} onClick={() => { if (!ventanaWhatsapp.fijado) setWhatsappCoupon(null); }}>
          <div ref={cajaWhatsapp} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Enviar cupón por WhatsApp" className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div>
                <CardTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Enviar cupón por WhatsApp</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Codigo: <span className="font-mono font-bold text-primary">{whatsappCoupon.code}</span></p>
              </div>
              <div className="flex items-center gap-1"><ControlesDeVentana ventana={ventanaWhatsapp} />
              <button aria-label="Quitar" onClick={() => setWhatsappCoupon(null)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors">
                <X className="h-5 w-5" />
              </button></div>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Preview del mensaje */}
              <div className="bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
                <p className="text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] whitespace-pre-line">{buildWhatsappMsg(whatsappCoupon)}</p>
              </div>
              {/* Enviar a un cliente */}
              <Field label="Enviar a un cliente" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {(id) => (
                  <div className="flex gap-2 mt-1">
                    <input
                      id={id}
                      type="tel"
                      value={whatsappPhone}
                      onChange={e => setWhatsappPhone(e.target.value)}
                      placeholder="Ej: 929340532"
                      className="flex-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary bg-[var(--surface-raised)] "
                    />
                    <button
                      onClick={() => { if (whatsappPhone.trim()) { sendWhatsapp(whatsappPhone, buildWhatsappMsg(whatsappCoupon)); } }}
                      disabled={!whatsappPhone.trim()}
                      className="px-4 min-h-10 rounded-xl bg-primary/10 text-white text-sm font-semibold hover:bg-primary/10 disabled:opacity-50 transition-colors inline-flex items-center gap-1"
                    >
                      <MessageCircle className="h-4 w-4" /> Enviar
                    </button>
                  </div>
                )}
              </Field>
              {/* Copiar mensaje */}
              <button
                onClick={() => { copyWhatsappMsg(whatsappCoupon); }}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 hover:bg-primary/20 transition-colors inline-flex items-center justify-center gap-2"
              >
                <Copy className="h-4 w-4" /> Copiar mensaje al portapapeles
              </button>
            </div>
            <div className="px-5 py-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <button onClick={() => setWhatsappCoupon(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--surface-sunken)] dark:bg-accent hover:bg-[var(--rule-soft)] transition-colors">Cerrar</button>
            </div>
            <TiradorDeVentana ventana={ventanaWhatsapp} />
          </div>
        </div>
      )}

      {/* ── Template Builder Modal ────────────────────────────────────────── */}
      {showTemplateBuilder && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 100 }} onClick={() => { if (!ventanaPlantilla.fijado) setShowTemplateBuilder(false); }}>
          <div ref={cajaPlantilla} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Constructor de plantilla" className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div>
                <CardTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Constructor de Plantilla</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Define el patrón de códigos automáticos</p>
              </div>
              <div className="flex items-center gap-1"><ControlesDeVentana ventana={ventanaPlantilla} />
              <button aria-label="Cerrar" onClick={() => setShowTemplateBuilder(false)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors">
                <X className="h-5 w-5" />
              </button></div>
            </div>
            <div className="px-5 py-4 space-y-4">
              <Field label="Patrón" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {(id) => (
                  <>
                    <input id={id} type="text" value={templatePattern} onChange={e => setTemplatePattern(e.target.value.toUpperCase())}
                      className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary font-mono" placeholder="BDAY{MMDD}{RND3}" />
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-2">
                      Variables: <span className="font-mono">{"{MMDD}"}</span> (mes/día), <span className="font-mono">{"{RND3}"}</span> (3 dígitos random)
                    </p>
                  </>
                )}
              </Field>
              <div className="bg-[var(--surface-alt)] p-4 rounded-xl">
                <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2">Plantillas sugeridas:</p>
                <div className="space-y-1">
                  {["BDAY{MMDD}{RND3}", "NEW{RND3}", "REACT{MMDD}", "GIFT{RND3}", "VIP{MMDD}{RND3}"].map(p => (
                    <button key={p} onClick={() => setTemplatePattern(p)}
                      className="w-full text-left px-3 min-h-10 rounded-xl text-sm font-mono bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary transition-colors">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={generateTestCoupon}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 hover:bg-primary/20 transition-colors">
                Generar código de prueba
              </button>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <button onClick={() => setShowTemplateBuilder(false)} className="w-full min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors">Cerrar</button>
            </div>
            <TiradorDeVentana ventana={ventanaPlantilla} />
          </div>
        </div>
      )}
    </>
  );
}
