"use client";

import { CARGO_OPTIONS, LUGAR_ENTREGA_OPTIONS, LEGAL_TOOLTIPS, numberToWords, validateField } from "@/lib/contratos/plantillas";
import { LegalTooltip } from "./ayudas-visuales-contratos";
import { cn } from "@/lib/utils";
import { Loader2, MapPin, AlertCircle, Info } from "@buleje/design-system/icons";
import type { EstadoContratos } from "./use-contratos";
import type { ContractTemplate } from "@/lib/contratos/plantillas";
export default function CampoWizard({ arch, field }: { arch: EstadoContratos; field: ContractTemplate["fields"][number] }) {
  const { autoFilledFields, wizardData, fieldErrors, setWizardData, setAutoFilledFields, detectLocation,
    geoLoading, geoResult, setCustomSelectValues, customSelectValues, setFieldErrors } = arch;
                              // Determine if field should be a select with options
                            const isCargoField = field.key === "CARGO" && field.type === "text";
                            const isLugarEntrega = field.key === "LUGAR_ENTREGA" && field.type === "text";
                            const effectiveType = (isCargoField || isLugarEntrega) ? "smart-select" : field.type;
                            const selectOptions = isCargoField ? CARGO_OPTIONS : isLugarEntrega ? LUGAR_ENTREGA_OPTIONS : field.options;

                            const hasTooltip = LEGAL_TOOLTIPS[field.key];
                            const isAutoFilled = autoFilledFields.has(field.key) && wizardData[field.key];
                            const validationError = fieldErrors[field.key];
                            const isCiudadField = field.key === "CIUDAD";

                            // Check if current select value is "Otro (escribir)"
                            const currentVal = wizardData[field.key] || "";
                            const isOtroSelected = (effectiveType === "smart-select" || field.type === "select") && currentVal === "Otro (escribir)";

  return (
                              <div key={field.key} className={(field.type === "textarea") ? "sm:col-span-2" : ""}>
                                <label className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] mb-1">
                                  {field.label} {field.required && <span className="text-[var(--data-error-500)]">*</span>}
                                  {hasTooltip && <LegalTooltip term={field.label} explanation={hasTooltip.explanation} example={hasTooltip.example} />}
                                  {isAutoFilled && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                                      Auto-completado
                                    </span>
                                  )}
                                </label>

                                {/* Ciudad field with geolocation button */}
                                {isCiudadField && (
                                  <div className="flex gap-2 mb-1">
                                    <input
                                      type="text"
                                      value={wizardData[field.key] || ""}
                                      onChange={e => {
                                        setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                        setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      }}
                                      placeholder={field.placeholder}
                                      className={cn(
                                        "flex-1 px-3 h-10 rounded-xl border text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30",
                                        isAutoFilled ? "border-[var(--accent)]/30 dark:border-[var(--accent)]/30 bg-primary/10 dark:bg-primary/15" : "border-[var(--rule-base)] bg-[var(--surface-raised)] "
                                      )}
                                    />
                                    <button
                                      type="button"
                                      onClick={detectLocation}
                                      disabled={geoLoading}
                                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-primary/10 hover:bg-primary/10 disabled:opacity-50 transition-colors shrink-0"
                                    >
                                      {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                                      Detectar
                                    </button>
                                  </div>
                                )}
                                {isCiudadField && geoResult && (
                                  <p className="text-[length:var(--ts-2xs)] text-[var(--accent-ink)] dark:text-[var(--accent)] flex items-center gap-1 mt-0.5 mb-1">
                                    <MapPin className="h-3 w-3" /> Ubicacion detectada: {geoResult}
                                  </p>
                                )}

                                {/* Smart select (CARGO, LUGAR_ENTREGA) */}
                                {!isCiudadField && effectiveType === "smart-select" && (
                                  <>
                                    <select
                                      value={isOtroSelected ? "Otro (escribir)" : (selectOptions?.includes(currentVal) ? currentVal : (currentVal && !selectOptions?.includes(currentVal) ? "Otro (escribir)" : ""))}
                                      onChange={e => {
                                        const v = e.target.value;
                                        if (v === "Otro (escribir)") {
                                          setWizardData(p => ({ ...p, [field.key]: "Otro (escribir)" }));
                                          setCustomSelectValues(p => ({ ...p, [field.key]: "" }));
                                        } else {
                                          setWizardData(p => ({ ...p, [field.key]: v }));
                                          setCustomSelectValues(p => { const n = { ...p }; delete n[field.key]; return n; });
                                        }
                                        setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      }}
                                      className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    >
                                      <option value="">Seleccionar...</option>
                                      {selectOptions?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    {(isOtroSelected || (currentVal && !selectOptions?.includes(currentVal) && currentVal !== "Otro (escribir)")) && (
                                      <input
                                        type="text"
                                        value={currentVal === "Otro (escribir)" ? (customSelectValues[field.key] || "") : currentVal}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setCustomSelectValues(p => ({ ...p, [field.key]: v }));
                                          setWizardData(p => ({ ...p, [field.key]: v || "Otro (escribir)" }));
                                        }}
                                        placeholder="Escriba el valor personalizado..."
                                        className="w-full mt-2 px-3 h-10 rounded-xl border border-secondary/50 bg-secondary/5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                      />
                                    )}
                                  </>
                                )}

                                {/* Original select fields */}
                                {!isCiudadField && effectiveType !== "smart-select" && field.type === "select" && (
                                  <select
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                    }}
                                    className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  >
                                    <option value="">Seleccionar...</option>
                                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                )}

                                {/* Textarea */}
                                {!isCiudadField && field.type === "textarea" && (
                                  <textarea
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      setWizardData(p => ({ ...p, [field.key]: e.target.value }));
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                    }}
                                    placeholder={field.placeholder}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                                  />
                                )}

                                {/* Standard inputs (text, number, date) */}
                                {!isCiudadField && effectiveType !== "smart-select" && field.type !== "select" && field.type !== "textarea" && (
                                  <input
                                    type={field.type}
                                    value={wizardData[field.key] || ""}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setWizardData(p => {
                                        const next = { ...p, [field.key]: val };
                                        // Auto-generate PRECIO_LETRAS / MONTO_LETRAS
                                        if ((field.key === "PRECIO_TOTAL" || field.key === "MONTO_PRESTAMO") && val) {
                                          const num = parseFloat(val);
                                          if (!isNaN(num) && num > 0) {
                                            const letrasKey = field.key === "PRECIO_TOTAL" ? "PRECIO_LETRAS" : "MONTO_LETRAS";
                                            next[letrasKey] = numberToWords(num);
                                          }
                                        }
                                        return next;
                                      });
                                      setAutoFilledFields(prev => { const n = new Set(prev); n.delete(field.key); return n; });
                                      // Validate on change
                                      const err = validateField(field.key, val, wizardData);
                                      setFieldErrors(prev => {
                                        const next = { ...prev };
                                        if (err) next[field.key] = err; else delete next[field.key];
                                        return next;
                                      });
                                    }}
                                    placeholder={field.placeholder}
                                    step={field.type === "number" ? "0.01" : undefined}
                                    className={cn(
                                      "w-full px-3 h-10 rounded-xl border text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30",
                                      isAutoFilled && !isCiudadField ? "border-[var(--accent)]/30 dark:border-[var(--accent)]/30 bg-primary/10 dark:bg-primary/15" : validationError ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : "border-[var(--rule-base)] bg-[var(--surface-raised)] "
                                    )}
                                  />
                                )}

                                {/* Validation error */}
                                {validationError && (
                                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3 shrink-0" /> {validationError}
                                  </p>
                                )}

                                {/* Auto-generated letras preview */}
                                {(field.key === "PRECIO_LETRAS" || field.key === "MONTO_LETRAS") && wizardData[field.key] && (
                                  <p className="text-[length:var(--ts-2xs)] text-primary dark:text-[var(--accent)] mt-1 flex items-center gap-1">
                                    <Info className="h-3 w-3 shrink-0" /> Auto-generado del monto numerico
                                  </p>
                                )}
                              </div>
  );
}