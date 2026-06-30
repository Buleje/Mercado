"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  X,
  Building2,
  Loader2,
  Copy,
  Globe,
  RotateCcw,
  KeyRound,
  ShoppingBag,
  Eye,
  EyeOff,
  AlertTriangle,
  Pencil,
  Check,
  Clock,
  Activity,
  StickyNote,
  Send,
  MessageSquare,
  ShieldCheck,
  Lock,
  LogOut,
  HeartPulse,
} from "@buleje/design-system/icons";
import Link from "next/link";
import type { TenantRow } from "@/lib/superadmin-types";
import { PlanBadge, StatusBadge } from "@/components/superadmin/_shared";
import { SunatOficialToggle } from "@/components/superadmin/tenants/SunatOficialToggle";
import { TenantHealthTab } from "@/components/superadmin/tenants/TenantHealthTab";

interface TenantDetailModalProps {
  tenant: TenantRow;
  onClose: () => void;
  /** Refresca la lista del padre tras un inline edit / extend trial. */
  onUpdated?: () => void;
}

type Tab = "resumen" | "salud" | "uso" | "facturacion" | "seguridad" | "actividad" | "notas";
type ActivityRow = {
  id: string;
  action: string;
  detail?: string | null;
  user?: string | null;
  createdAt: string;
};
type NoteRow = { id: string; body: string; author: string; createdAt: string };
type SecurityInfo = {
  username: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginDetail: string | null;
};

function fmtD(d: string | null) {
  return d
    ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
}
function fmtDT(d: string) {
  return new Date(d).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtMoney(n: number) {
  return `S/${n.toFixed(2)}`;
}
function unlimited(v: number) {
  return v === -1 ? "∞" : v.toLocaleString("es-PE");
}
function pct(u: number, m: number) {
  return m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100));
}

export function TenantDetailModal({ tenant, onClose, onUpdated }: TenantDetailModalProps) {
  const t = tenant;
  const [tab, setTab] = useState<Tab>("resumen");
  const [showPass, setShowPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [resetUsername, setResetUsername] = useState<string | null>(null);
  const [credCopied, setCredCopied] = useState(false);
  const [tempPasswordCopied, setTempPasswordCopied] = useState(false);
  const storeInfo = t.stores?.[0];

  // ── Inline edit (C3): nombre + email del dueño ──
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(t.name);
  const [emailInput, setEmailInput] = useState(t.ownerEmail ?? "");
  const [savingEdit, setSavingEdit] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);

  // ── Actividad ──
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  // ── Notas ──
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  // ── Seguridad ──
  const [security, setSecurity] = useState<SecurityInfo | null>(null);
  const [secBusy, setSecBusy] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "seguridad" || security !== null) return;
    fetch(`/api/superadmin/tenants/${t.slug}/security`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setSecurity(
          d ?? {
            username: null,
            twoFactorEnabled: false,
            lastLoginAt: null,
            lastLoginDetail: null,
          },
        ),
      )
      .catch(() =>
        setSecurity({
          username: null,
          twoFactorEnabled: false,
          lastLoginAt: null,
          lastLoginDetail: null,
        }),
      );
  }, [tab, security, t.slug]);

  const secAction = async (
    action: "force-change" | "reset-2fa" | "logout-all",
    confirmMsg: string,
  ) => {
    if (!window.confirm(confirmMsg)) return;
    const totpCode = window.prompt("Código TOTP (6 dígitos) para confirmar:");
    if (!totpCode || !/^\d{6}$/.test(totpCode)) return;
    setSecBusy(action);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/security`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action, totpCode }),
      });
      if (res.ok) {
        if (action === "reset-2fa") setSecurity((s) => (s ? { ...s, twoFactorEnabled: false } : s));
        if (action === "logout-all")
          window.alert("Listo. Se cerraron las sesiones activas de este negocio.");
      } else {
        const d = await res.json().catch(() => ({}));
        window.alert(
          d.error === "totp_required" || d.error === "invalid_totp"
            ? "Código TOTP inválido."
            : "No se pudo completar la acción.",
        );
      }
    } finally {
      setSecBusy(null);
    }
  };

  useEffect(() => {
    if (tab !== "actividad" || activity !== null) return;
    fetch(`/api/superadmin/activity?tenant=${t.id}&limit=40`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setActivity((d?.logs ?? d?.activity ?? d?.items ?? []) as ActivityRow[]))
      .catch(() => setActivity([]));
  }, [tab, activity, t.id]);

  useEffect(() => {
    if (tab !== "notas" || notes !== null) return;
    fetch(`/api/superadmin/tenants/${t.slug}/notes`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNotes((d?.notes ?? []) as NoteRow[]))
      .catch(() => setNotes([]));
  }, [tab, notes, t.slug]);

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: nameInput.trim(), ownerEmail: emailInput.trim() }),
      });
      if (res.ok) {
        setEditing(false);
        onUpdated?.();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExtendTrial = async (days: number) => {
    setTrialBusy(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/extend-trial`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ days }),
      });
      if (res.ok) onUpdated?.();
    } finally {
      setTrialBusy(false);
    }
  };

  const addNote = useCallback(async () => {
    if (!noteInput.trim() || savingNote) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/notes`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ body: noteInput.trim() }),
      });
      const d = await res.json();
      if (res.ok && d.note) {
        setNotes((prev) => [d.note, ...(prev ?? [])]);
        setNoteInput("");
      }
    } finally {
      setSavingNote(false);
    }
  }, [noteInput, savingNote, t.slug]);

  const handleResetPassword = async () => {
    const totpCode = window.prompt(
      `Código TOTP (6 dígitos) para resetear contraseña de "${t.name}":`,
    );
    if (!totpCode || !/^\d{6}$/.test(totpCode)) {
      setResetResult("Código TOTP inválido — operación cancelada");
      return;
    }
    setResetLoading(true);
    setResetResult(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ totpCode }),
      });
      const data = (await res.json()) as {
        tempPassword?: string;
        username?: string;
        error?: string;
      };
      if (res.ok && data.tempPassword) {
        setResetResult(data.tempPassword);
        setResetUsername(data.username ?? null);
      } else setResetResult(res.ok ? null : `Error: ${data.error ?? "No se pudo resetear"}`);
    } catch {
      setResetResult("Error de red.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleCopyInfo = () => {
    void navigator.clipboard.writeText(
      [`Tenant: ${t.name} (${t.slug})`, `Email: ${t.ownerEmail ?? "—"}`, `Plan: ${t.plan}`].join(
        "\n",
      ),
    );
    setCredCopied(true);
    setTimeout(() => setCredCopied(false), 2000);
  };
  const handleCopyTempPassword = () => {
    if (!resetResult || resetResult.startsWith("Error")) return;
    void navigator.clipboard.writeText(resetResult);
    setTempPasswordCopied(true);
    setTimeout(() => setTempPasswordCopied(false), 2000);
  };

  const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: "resumen", label: "Resumen", icon: Building2 },
    { id: "salud", label: "Salud", icon: HeartPulse },
    { id: "uso", label: "Uso", icon: KeyRound },
    { id: "facturacion", label: "Facturación", icon: ShoppingBag },
    { id: "seguridad", label: "Seguridad", icon: ShieldCheck },
    { id: "actividad", label: "Actividad", icon: Activity },
    { id: "notas", label: "Notas", icon: StickyNote },
  ];

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- backdrop modal (cierra al click; Escape también cierra)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- contenedor del modal: stopPropagation, no interactivo */}
      <div
        className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con inline edit */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--rule-base)]">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="email del dueño"
                  className="w-full h-8 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-sm text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 h-8 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {savingEdit ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}{" "}
                    Guardar
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setNameInput(t.name);
                      setEmailInput(t.ownerEmail ?? "");
                    }}
                    className="rounded-lg px-3 h-8 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[var(--accent)] shrink-0" />
                  <span className="truncate">{t.name}</span>
                  <button
                    onClick={() => setEditing(true)}
                    title="Editar nombre / email"
                    className="text-[var(--text-tertiary)] hover:text-[var(--accent)] shrink-0"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </h2>
                <p className="text-gray-500 text-xs mt-1 font-mono">{t.slug}</p>
                {t.ownerEmail && (
                  <p className="text-[var(--text-tertiary)] text-xs mt-0.5 truncate">
                    {t.ownerEmail}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <PlanBadge plan={t.plan} />
            <StatusBadge active={t.active} />
            <Link
              href={`/superadmin/tenants/${t.slug}`}
              title="Ficha 360 del negocio"
              className="inline-flex h-8 items-center rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              Ficha 360
            </Link>
            <Link
              href={`/superadmin/chat?tenant=${t.id}&name=${encodeURIComponent(t.name)}`}
              title="Chatear con este negocio"
              className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <MessageSquare className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-3 pt-3 border-b border-[var(--rule-base)] overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${tab === id ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === "resumen" && (
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
                        ? "text-[var(--accent-dark)]"
                        : "text-[var(--data-error-500)]",
                  },
                ].map(({ value, label, color }) => (
                  <div
                    key={label}
                    className="bg-[var(--surface-sunken)]/50 rounded-xl p-3 text-center"
                  >
                    <div className={`text-lg font-bold ${color}`}>{value}</div>
                    <div className="text-gray-500 text-[length:var(--ts-xs)] mt-0.5">{label}</div>
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
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 h-8 text-xs font-bold text-[#0d9488] hover:bg-[#0d9488] disabled:opacity-50"
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
                      className={`px-2 py-0.5 rounded-full text-[length:var(--ts-xs)] font-semibold ${storeInfo.isPublished ? "bg-teal-100 dark:bg-teal-900/40 text-[var(--accent)]" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}
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
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] text-[var(--text-primary)] text-xs font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5" /> {credCopied ? "¡Copiado!" : "Copiar info"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResetPassword()}
                      disabled={resetLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-teal-50 dark:bg-teal-500/40 border border-teal-500 text-[#0d9488] text-xs font-semibold disabled:opacity-50"
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
                      <p className="text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider text-[#0d9488] flex items-center gap-1.5">
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
                            `Hola ${t.name} 👋 Soy del equipo de Buleje. Reseteamos tu acceso al panel.\n\nUsuario: ${resetUsername ?? "admin"}\nContraseña temporal: ${resetResult}\n\nEntrá a ${typeof window !== "undefined" ? window.location.origin : "https://www.buleje.pe"}/admin/login y al ingresar te pedirá crear tu propia contraseña. Esta temporal es de un solo uso.`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[var(--data-success-600,#16a34a)] px-3 py-1.5 text-xs font-extrabold text-white hover:opacity-90"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Enviar al dueño por WhatsApp
                        </a>
                      )}
                      {!resetResult.startsWith("Error") && !t.ownerPhone && (
                        <p className="text-xs text-[var(--text-tertiary)]">
                          Sin teléfono registrado — copiá la clave y entregala por un canal seguro.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === "salud" && <TenantHealthTab slug={t.slug} />}

          {tab === "uso" &&
            (t.usage && t.limits ? (
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
                                : "text-gray-400"
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
            ))}

          {tab === "facturacion" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  { label: "Stripe Customer", value: t.stripeCustomerId ?? "—" },
                  { label: "Subscription", value: t.stripeSubscriptionId ?? "—" },
                  { label: "Periodo vence", value: fmtD(t.stripeCurrentPeriodEnd) },
                  { label: "Trial termina", value: fmtD(t.trialEndsAt) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[var(--surface-sunken)]/50 rounded-lg px-3 py-2">
                    <span className="text-gray-400">{label}</span>
                    <p className="text-[var(--text-secondary)] font-mono truncate">{value}</p>
                  </div>
                ))}
              </div>
              {t.cancelAtPeriodEnd && (
                <div className="flex items-center gap-2 text-[#0d9488] text-xs bg-teal-50 dark:bg-teal-950/30 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4" /> Cancelará al final del periodo.
                </div>
              )}
              <SunatOficialToggle slug={t.slug} />
              {t.customDomain && (
                <div className="bg-[var(--surface-sunken)]/50 rounded-lg px-3 py-2 text-xs">
                  <span className="text-gray-400">Dominio personalizado</span>
                  <p className="text-[var(--data-success-500)] font-semibold flex items-center gap-1.5 mt-0.5">
                    <Globe className="w-4 h-4" /> {t.customDomain}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "seguridad" &&
            (security === null ? (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Cargando…</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--rule-base)] p-3">
                    <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> Doble factor (2FA)
                    </p>
                    <p
                      className={`mt-1 text-sm font-bold ${security.twoFactorEnabled ? "text-[var(--data-success-600,#059669)]" : "text-[#0d9488]"}`}
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
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-teal-500 text-[#0d9488] h-10 text-sm font-bold hover:bg-[#0d9488] disabled:opacity-50"
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
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] h-10 text-sm font-bold hover:bg-[var(--surface-sunken)] disabled:opacity-40"
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
                        "¿Cerrar TODAS las sesiones activas de este negocio? Tendrán que volver a iniciar sesión. Útil si sospechás un acceso indebido.",
                      )
                    }
                    disabled={!!secBusy}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--data-error-500)] text-[var(--data-error-600,#dc2626)] h-10 text-sm font-bold hover:bg-[var(--data-error-50,#fef2f2)] disabled:opacity-50"
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
            ))}

          {tab === "actividad" &&
            (activity === null ? (
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
            ))}

          {tab === "notas" && (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  rows={2}
                  placeholder="Nota interna sobre este negocio (solo superadmin)…"
                  className="flex-1 resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
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
          )}
        </div>
      </div>
    </div>
  );
}
