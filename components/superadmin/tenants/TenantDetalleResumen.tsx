"use client";

import { Loader2, Copy, RotateCcw, KeyRound, ShoppingBag, Eye, EyeOff, AlertTriangle, Clock, MessageSquare } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { fmtD, fmtMoney } from "@/components/superadmin/tenants/tenant-detalle-shared";
import type { TenantDetalle } from "@/components/superadmin/tenants/useTenantDetalle";

/** Pestaña «Resumen» de la ficha rápida: cifras del mes, prueba, marketplace y credenciales. */
export function TenantDetalleResumen({ t, d }: { t: TenantRow; d: TenantDetalle }) {
  const {
    storeInfo, trialBusy, handleExtendTrial, handleCopyInfo, credCopied, handleResetPassword, resetLoading,
    resetResult, showPass, setShowPass, handleCopyTempPassword, tempPasswordCopied, resetUsername,
  } = d;
  return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  {
                    value: t._count.AdminUser,
                    label: "Usuarios",
                    color: "text-[var(--text-primary)]",
                  },
                  {
                    value: t.usage?.products ?? 0,
                    label: "Productos",
                    color: "text-[var(--text-primary)]",
                  },
                  {
                    value: t.monthOrders ?? t.usage?.ordersThisMonth ?? 0,
                    label: "Pedidos/mes",
                    color: "text-[var(--data-success-500)]",
                  },
                  {
                    value: fmtMoney(t.monthRevenue ?? 0),
                    label: "Ventas/mes",
                    color: "text-[var(--data-success-500)]",
                  },
                  {
                    value: fmtMoney(t.monthProfit ?? 0),
                    label: "Ganancia",
                    color:
                      (t.monthProfit ?? 0) >= 0
                        ? "text-[var(--accent-dark)] dark:text-[var(--accent)]"
                        : "text-[var(--data-error-500)]",
                  },
                ].map(({ value, label, color }) => (
                  <div
                    key={label}
                    className="bg-[var(--surface-sunken)]/50 rounded-xl p-3 text-center"
                  >
                    <div className={`text-lg font-bold ${color}`}>{value}</div>
                    <div className="text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] text-[length:var(--ts-xs)] mt-0.5">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Trial + extender (C3) */}
              <div className="flex items-center justify-between gap-2 bg-[var(--surface-sunken)]/50 rounded-xl px-3 py-2.5">
                <span className="text-sm text-[var(--text-secondary)]">
                  Trial:{" "}
                  <strong className="text-[var(--text-primary)]">{fmtD(t.trialEndsAt)}</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => handleExtendTrial(d)}
                      disabled={trialBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 h-8 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--accent-600)] disabled:opacity-50"
                    >
                      {trialBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}{" "}
                      +{d}d
                    </button>
                  ))}
                </div>
              </div>

              {storeInfo && (
                <div className="bg-[var(--surface-sunken)]/50 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-[var(--accent)]" />
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">
                      Marketplace
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[length:var(--ts-xs)] font-semibold ${storeInfo.isPublished ? "bg-teal-100 dark:bg-teal-900/40 text-[var(--accent)]" : "bg-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]"}`}
                    >
                      {storeInfo.isPublished ? "Publicada" : "No publicada"}
                    </span>
                  </div>
                </div>
              )}

              {/* Credenciales */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text-tertiary)] flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[var(--accent)]" /> Credenciales y Acceso
                </h3>
                <div className="bg-[var(--surface-sunken)]/60 border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={handleCopyInfo}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] text-[var(--text-primary)] text-xs font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5" /> {credCopied ? "¡Copiado!" : "Copiar info"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResetPassword()}
                      disabled={resetLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-teal-50 dark:bg-teal-500/40 border border-teal-500 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-semibold disabled:opacity-50"
                    >
                      {resetLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}{" "}
                      Reset contraseña
                    </button>
                  </div>
                  {resetResult && (
                    <div className="text-xs bg-teal-50 dark:bg-teal-500/15 border-2 border-teal-500/40 rounded-lg px-3 py-2.5 space-y-2">
                      <p className="text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider text-[var(--accent-ink)] dark:text-[var(--accent)] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Contraseña temporal (una sola vez)
                      </p>
                      {resetResult.startsWith("Error") ? (
                        <p className="font-mono text-[var(--data-error-500)]">{resetResult}</p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 font-mono text-sm font-extrabold text-[var(--text-primary)] bg-[var(--surface-raised)] px-2 py-1 rounded select-all">
                            {showPass ? resetResult : "•".repeat(Math.max(6, resetResult.length))}
                          </code>
                          <button
                            type="button"
                            onClick={() => setShowPass((v) => !v)}
                            className="text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                          >
                            {showPass ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyTempPassword}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-teal-500 text-white text-xs font-extrabold"
                          >
                            <Copy className="w-3 h-3" /> {tempPasswordCopied ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                      )}
                      {!resetResult.startsWith("Error") && t.ownerPhone && (
                        <a
                          href={`https://wa.me/${t.ownerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                            `Hola ${t.name} 👋 Soy del equipo de Buleje. Reseteamos tu acceso al panel.\n\nUsuario: ${resetUsername ?? "admin"}\nContraseña temporal: ${resetResult}\n\nEntra a ${typeof window !== "undefined" ? window.location.origin : "https://www.buleje.pe"}/admin/login y al ingresar te pedirá crear tu propia contraseña. Esta temporal es de un solo uso.`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[var(--data-success-600)] px-3 py-1.5 text-xs font-extrabold text-white hover:opacity-90"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Enviar al dueño por WhatsApp
                        </a>
                      )}
                      {!resetResult.startsWith("Error") && !t.ownerPhone && (
                        <p className="text-xs text-[var(--text-tertiary)]">
                          Sin teléfono registrado — copia la clave y entrégala por un canal seguro.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
  );
}
