"use client";

import { Copy, MessageCircle } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { ruleConfigs } from "@/components/admin/cupones/cupones-compartido";
import type { Cupones } from "@/components/admin/cupones/hooks/use-cupones";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

/** Ventanas de configurar regla, enviar por WhatsApp y plantilla de código. Pieza de CouponsTab: recibe `useCupones` entero. */
export default function CuponesVentanas({ cup }: { cup: Cupones }) {
  const {
    editingRule,
    setEditingRule,
    showRuleConfig,
    setShowRuleConfig,
    showTemplateBuilder,
    setShowTemplateBuilder,
    templatePattern,
    setTemplatePattern,
    whatsappCoupon,
    setWhatsappCoupon,
    whatsappPhone,
    setWhatsappPhone,
    saveRuleConfig,
    generateTestCoupon,
    buildWhatsappMsg,
    sendWhatsapp,
    copyWhatsappMsg,
  } = cup;
  return (
    <>
      {/* ── Rule Configuration Modal ──────────────────────────────────────── */}
      {showRuleConfig && editingRule && (
        <AdminModal
          open
          onClose={() => setShowRuleConfig(false)}
          title="Configurar regla"
          description={ruleConfigs[editingRule.type].label}
          size="md"
          claveVentana="cupones-regla"
          footer={
            <ModalFooter>
              <button
                onClick={() => setShowRuleConfig(false)}
                className={button({ variant: "secondary" })}
              >
                Cancelar
              </button>
              <button onClick={saveRuleConfig} className={button({ variant: "primary" })}>
                Guardar
              </button>
            </ModalFooter>
          }
        >
          <div className={`space-y-4 ${MODAL_BODY}`}>
            <Field
              label="Tipo de descuento"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <select
                value={editingRule.config.discountType}
                onChange={(e) =>
                  setEditingRule({
                    ...editingRule,
                    config: {
                      ...editingRule.config,
                      discountType: e.target.value as "percent" | "fixed",
                    },
                  })
                }
                className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary bg-[var(--surface-raised)] "
              >
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
              </select>
            </Field>
            <Field
              label="Valor del descuento"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <input
                type="number"
                value={editingRule.config.discountValue}
                onChange={(e) =>
                  setEditingRule({
                    ...editingRule,
                    config: { ...editingRule.config, discountValue: Number(e.target.value) },
                  })
                }
                className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
              />
            </Field>
            {editingRule.type !== "min-spend" && (
              <Field
                label="Días de validez"
                labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
              >
                <input
                  type="number"
                  value={editingRule.config.validityDays}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      config: { ...editingRule.config, validityDays: Number(e.target.value) },
                    })
                  }
                  className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                />
              </Field>
            )}
            {editingRule.type === "inactive" && (
              <Field
                label="Días de inactividad antes de activar"
                labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
              >
                <input
                  type="number"
                  value={editingRule.config.inactiveDays}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      config: { ...editingRule.config, inactiveDays: Number(e.target.value) },
                    })
                  }
                  className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                />
              </Field>
            )}
            {editingRule.type === "min-spend" && (
              <Field
                label="Gasto mínimo acumulado (S/)"
                labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
              >
                <input
                  type="number"
                  value={editingRule.config.minSpend}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      config: { ...editingRule.config, minSpend: Number(e.target.value) },
                    })
                  }
                  className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                />
              </Field>
            )}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-[var(--surface-alt)] rounded-xl">
              <input
                type="checkbox"
                id="ruleAutoSend"
                checked={editingRule.config.autoSend}
                onChange={(e) =>
                  setEditingRule({
                    ...editingRule,
                    config: { ...editingRule.config, autoSend: e.target.checked },
                  })
                }
                className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
              />
              <label
                htmlFor="ruleAutoSend"
                className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] cursor-pointer flex-1"
              >
                Enviar automáticamente por WhatsApp
              </label>
            </div>
          </div>
        </AdminModal>
      )}

      {/* ── WhatsApp Send Modal ──────────────────────────────────────────── */}
      {whatsappCoupon && (
        <AdminModal
          open
          onClose={() => setWhatsappCoupon(null)}
          title="Enviar cupón por WhatsApp"
          description={`Código: ${whatsappCoupon.code}`}
          icon={MessageCircle}
          size="md"
          claveVentana="cupones-whatsapp"
          footer={
            <ModalFooter>
              <button
                onClick={() => setWhatsappCoupon(null)}
                className={button({ variant: "secondary" })}
              >
                Cerrar
              </button>
            </ModalFooter>
          }
        >
          <div className={`space-y-4 ${MODAL_BODY}`}>
            {/* Preview del mensaje */}
            <div className="bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
              <p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] whitespace-pre-line">
                {buildWhatsappMsg(whatsappCoupon)}
              </p>
            </div>
            {/* Enviar a un cliente */}
            <Field
              label="Enviar a un cliente"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              {(id) => (
                <div className="flex gap-2 mt-1">
                  <input
                    id={id}
                    type="tel"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="Ej: 929340532"
                    className="flex-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary bg-[var(--surface-raised)] "
                  />
                  <button
                    onClick={() => {
                      if (whatsappPhone.trim()) {
                        sendWhatsapp(whatsappPhone, buildWhatsappMsg(whatsappCoupon));
                      }
                    }}
                    disabled={!whatsappPhone.trim()}
                    className={button({ variant: "primary" })}
                  >
                    <MessageCircle className="h-4 w-4" /> Enviar
                  </button>
                </div>
              )}
            </Field>
            {/* Copiar mensaje */}
            <button
              onClick={() => {
                copyWhatsappMsg(whatsappCoupon);
              }}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 hover:bg-primary/20 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Copy className="h-4 w-4" /> Copiar mensaje al portapapeles
            </button>
          </div>
        </AdminModal>
      )}

      {/* ── Template Builder Modal ────────────────────────────────────────── */}
      {showTemplateBuilder && (
        <AdminModal
          open
          onClose={() => setShowTemplateBuilder(false)}
          title="Constructor de plantilla"
          description="Define el patrón de códigos automáticos"
          size="md"
          claveVentana="cupones-plantilla"
          footer={
            <ModalFooter>
              <button
                onClick={() => setShowTemplateBuilder(false)}
                className={button({ variant: "secondary" })}
              >
                Cerrar
              </button>
            </ModalFooter>
          }
        >
          <div className={`space-y-4 ${MODAL_BODY}`}>
            <Field
              label="Patrón"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              {(id) => (
                <>
                  <input
                    id={id}
                    type="text"
                    value={templatePattern}
                    onChange={(e) => setTemplatePattern(e.target.value.toUpperCase())}
                    className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary font-mono"
                    placeholder="BDAY{MMDD}{RND3}"
                  />
                  <p className="text-sm text-[var(--text-tertiary)] dark:text-muted mt-2">
                    Variables: <span className="font-mono">{"{MMDD}"}</span> (mes/día),{" "}
                    <span className="font-mono">{"{RND3}"}</span> (3 dígitos random)
                  </p>
                </>
              )}
            </Field>
            <div className="bg-[var(--surface-alt)] p-4 rounded-xl">
              <p className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted mb-2">
                Plantillas sugeridas:
              </p>
              <div className="space-y-1">
                {[
                  "BDAY{MMDD}{RND3}",
                  "NEW{RND3}",
                  "REACT{MMDD}",
                  "GIFT{RND3}",
                  "VIP{MMDD}{RND3}",
                ].map((p) => (
                  <button
                    key={p}
                    onClick={() => setTemplatePattern(p)}
                    className="w-full text-left px-3 min-h-12 rounded-xl text-sm font-mono bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={generateTestCoupon}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              Generar código de prueba
            </button>
          </div>
        </AdminModal>
      )}
    </>
  );
}
