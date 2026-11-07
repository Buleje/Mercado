"use client";

import { Loader2, Globe, AlertTriangle, Send } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { SunatOficialToggle } from "@/components/superadmin/tenants/SunatOficialToggle";
import { type ActivityRow, fmtD, fmtDT, unlimited, pct } from "@/components/superadmin/tenants/tenant-detalle-shared";
import type { TenantDetalle } from "@/components/superadmin/tenants/useTenantDetalle";

/** Pestaña «Uso»: consumo contra los límites del plan. */
export function TenantDetalleUso({ t }: { t: TenantRow }) {
  return             (t.usage && t.limits ? (
              <div className="space-y-3">
                {(
                  [
                    { label: "Productos", used: t.usage.products, max: t.limits.maxProducts },
                    { label: "Usuarios", used: t.usage.users, max: t.limits.maxUsers },
                    {
                      label: "Pedidos/mes",
                      used: t.usage.ordersThisMonth,
                      max: t.limits.maxOrdersPerMonth,
                    },
                  ] as const
                ).map(({ label, used, max }) => {
                  const p = pct(used, max);
                  const full = max !== -1 && p >= 100;
                  const warn = max !== -1 && p >= 80 && !full;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--text-secondary)]">{label}</span>
                        <span
                          className={
                            full
                              ? "text-[var(--data-error-500)] font-bold"
                              : warn
                                ? "text-teal-500"
                                : "text-[var(--text-tertiary)]"
                          }
                        >
                          {used.toLocaleString("es-PE")} / {unlimited(max)}
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                        {max === -1 ? (
                          <div className="h-full bg-gray-300 dark:bg-gray-600/30 rounded-full w-full" />
                        ) : (
                          <div
                            className={`h-full rounded-full ${full ? "bg-[var(--data-error-500)]" : warn ? "bg-teal-500" : "bg-[var(--accent)]"}`}
                            style={{ width: `${p}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">Sin datos de uso.</p>
            ));
}

/** Pestaña «Facturación»: Stripe, SUNAT oficial y dominio propio. */
export function TenantDetalleFacturacion({ t }: { t: TenantRow }) {
  return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  { label: "Stripe Customer", value: t.stripeCustomerId ?? "—" },
                  { label: "Subscription", value: t.stripeSubscriptionId ?? "—" },
                  { label: "Periodo vence", value: fmtD(t.stripeCurrentPeriodEnd) },
                  { label: "Trial termina", value: fmtD(t.trialEndsAt) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[var(--surface-sunken)]/50 rounded-lg px-3 py-2">
                    <span className="text-[var(--text-tertiary)]">{label}</span>
                    <p className="text-[var(--text-secondary)] font-mono truncate">{value}</p>
                  </div>
                ))}
              </div>
              {t.cancelAtPeriodEnd && (
                <div className="flex items-center gap-2 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs bg-teal-50 dark:bg-teal-950/30 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4" /> Cancelará al final del periodo.
                </div>
              )}
              <SunatOficialToggle slug={t.slug} />
              {t.customDomain && (
                <div className="bg-[var(--surface-sunken)]/50 rounded-lg px-3 py-2 text-xs">
                  <span className="text-[var(--text-tertiary)]">Dominio personalizado</span>
                  <p className="text-[var(--data-success-500)] font-semibold flex items-center gap-1.5 mt-0.5">
                    <Globe className="w-4 h-4" /> {t.customDomain}
                  </p>
                </div>
              )}
            </div>
  );
}

/** Pestaña «Actividad»: últimas 40 acciones registradas de la tienda. */
export function TenantDetalleActividad({ activity }: { activity: ActivityRow[] | null }) {
  return             (activity === null ? (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                Cargando actividad…
              </p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                Sin actividad registrada.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3 border-l-2 border-[var(--rule-base)] pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{a.action}</p>
                      {a.detail && (
                        <p className="text-xs text-[var(--text-secondary)] truncate">{a.detail}</p>
                      )}
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {fmtDT(a.createdAt)}
                        {a.user ? ` · ${a.user}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ));
}

/** Pestaña «Notas»: notas internas del superadmin sobre la tienda. */
export function TenantDetalleNotas({ d }: { d: TenantDetalle }) {
  const { noteInput, setNoteInput, addNote, savingNote, notes } = d;
  return (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  rows={2}
                  placeholder="Nota interna sobre este negocio (solo superadmin)…"
                  className="flex-1 resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={addNote}
                  disabled={savingNote || !noteInput.trim()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white disabled:opacity-40"
                >
                  {savingNote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              {notes === null ? (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-6">
                  Cargando notas…
                </p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-6">
                  Sin notas todavía.
                </p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 px-3 py-2"
                    >
                      <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                        {n.body}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        {n.author} · {fmtDT(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
  );
}
