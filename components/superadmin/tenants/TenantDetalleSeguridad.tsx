"use client";

import { Loader2, KeyRound, Clock, ShieldCheck, Lock, LogOut } from "@buleje/design-system/icons";
import { fmtDT } from "@/components/superadmin/tenants/tenant-detalle-shared";
import type { TenantDetalle } from "@/components/superadmin/tenants/useTenantDetalle";

/** Pestaña «Seguridad» de la ficha rápida: 2FA, último ingreso y acciones con TOTP. */
export function TenantDetalleSeguridad({ d }: { d: TenantDetalle }) {
  const { security, secBusy, secAction } = d;
  return             (security === null ? (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Cargando…</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--rule-base)] p-3">
                    <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> Doble factor (2FA)
                    </p>
                    <p
                      className={`mt-1 text-sm font-bold ${security.twoFactorEnabled ? "text-[var(--data-success-600)]" : "text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
                    >
                      {security.twoFactorEnabled ? "Activo ✓" : "No configurado"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--rule-base)] p-3">
                    <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Último ingreso
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">
                      {security.lastLoginAt ? fmtDT(security.lastLoginAt) : "—"}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--surface-sunken)]/50 px-3 py-2 text-xs text-[var(--text-secondary)]">
                  Admin principal: <strong>{security.username ?? "—"}</strong>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() =>
                      secAction(
                        "force-change",
                        "¿Forzar a este negocio a cambiar su contraseña en el próximo login?",
                      )
                    }
                    disabled={!!secBusy}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-teal-500 text-[var(--accent-ink)] dark:text-[var(--accent)] h-10 text-sm font-semibold hover:bg-[var(--accent-600)] disabled:opacity-50"
                  >
                    {secBusy === "force-change" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}{" "}
                    Forzar cambio de contraseña
                  </button>
                  <button
                    onClick={() =>
                      secAction(
                        "reset-2fa",
                        "¿Resetear el 2FA? El dueño deberá volver a configurarlo.",
                      )
                    }
                    disabled={!!secBusy || !security.twoFactorEnabled}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] h-10 text-sm font-semibold hover:bg-[var(--surface-sunken)] disabled:opacity-40"
                  >
                    {secBusy === "reset-2fa" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}{" "}
                    Resetear 2FA
                  </button>
                  <button
                    onClick={() =>
                      secAction(
                        "logout-all",
                        "¿Cerrar TODAS las sesiones activas de este negocio? Tendrán que volver a iniciar sesión. Útil si sospechas un acceso indebido.",
                      )
                    }
                    disabled={!!secBusy}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--data-error-500)] text-[var(--data-error-600)] h-10 text-sm font-semibold hover:bg-[var(--data-error-50)] disabled:opacity-50"
                  >
                    {secBusy === "logout-all" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}{" "}
                    Cerrar todas las sesiones
                  </button>
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Estas acciones requieren tu código TOTP y quedan en el audit log.
                </p>
              </div>
            ));
}
