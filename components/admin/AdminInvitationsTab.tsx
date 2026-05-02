"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UserPlus, Send, Loader2, X, Copy, Check,
  Phone, Trash2,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

interface InvitationRow {
  id: string;
  phone: string;
  name: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  cajero: "Cajero",
  almacenero: "Almacenero",
  manager: "Encargado",
};

const STATUS_BG: Record<string, string> = {
  pending: "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800",
  accepted: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800",
  revoked: "bg-gray-100 dark:bg-gray-800 text-[var(--text-secondary)] border-[var(--rule-base)]",
  expired: "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800",
};

export default function AdminInvitationsTab() {
  const [rows, setRows] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"cajero" | "almacenero" | "manager">("cajero");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const inflightRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    try {
      const res = await fetch("/api/admin/invitations", {
        credentials: "include",
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (inflightRef.current === ctrl) setRows(data.invitations ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      /* otros errores: silencioso */
    } finally {
      if (inflightRef.current === ctrl) {
        setLoading(false);
        inflightRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { inflightRef.current?.abort(); };
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ phone, name, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos enviar la invitación");
        return;
      }
      setLastInviteUrl(data.inviteUrl);
      setPhone("");
      setName("");
      setShowForm(false);
      await load();
    } catch {
      setError("Error de red.");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    const res = await fetch(`/api/admin/invitations/${id}/revoke`, {
      method: "POST",
      headers: csrfHeaders(),
    });
    if (res.ok) await load();
  };

  const copy = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* noop */ }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--text-primary)]">Invitaciones</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Invitá a tu equipo (cajeros, almaceneros) por WhatsApp con un link único.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 h-12 px-5 rounded-xl bg-[var(--accent)] text-white text-sm font-extrabold shadow-md"
        >
          <UserPlus className="h-5 w-5" />
          Nueva invitación
        </button>
      </div>

      {lastInviteUrl && (
        <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200 mb-1">
            ✓ Invitación enviada por WhatsApp
          </p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mb-2">
            Si no llega, podés copiar y compartir el link:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white dark:bg-emerald-950/60 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 truncate text-[var(--text-primary)]">
              {lastInviteUrl}
            </code>
            <button
              onClick={() => copy(lastInviteUrl, "last")}
              className="h-9 px-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white text-xs font-bold"
            >
              {copiedId === "last" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedId === "last" ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--surface-raised)] p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="inv-name" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                Nombre
              </label>
              <input
                id="inv-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                placeholder="Pedro Quispe"
                className="w-full h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
              />
            </div>
            <div>
              <label htmlFor="inv-phone" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                WhatsApp
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                <input
                  id="inv-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  pattern="[+0-9 ]{7,20}"
                  placeholder="+51 999 888 777"
                  className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                />
              </div>
            </div>
            <div>
              <label htmlFor="inv-role" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                Rol
              </label>
              <select
                id="inv-role"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="w-full h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
              >
                <option value="cajero">Cajero</option>
                <option value="almacenero">Almacenero</option>
                <option value="manager">Encargado</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 h-12 px-5 rounded-xl bg-[var(--accent)] text-white text-sm font-extrabold shadow-md disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              Enviar por WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-[var(--text-secondary)]">
          Sin invitaciones aún.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-canvas)] text-[var(--text-tertiary)]">
              <tr>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Nombre</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Rol</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">WhatsApp</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Estado</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Vence</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--rule-base)] bg-[var(--surface-raised)]">
                  <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{r.name}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{ROLE_LABEL[r.role] ?? r.role}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{r.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${STATUS_BG[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-tertiary)] text-xs">
                    {new Date(r.expiresAt).toLocaleDateString("es-PE")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "pending" && (
                      <button
                        onClick={() => revoke(r.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-red-700 dark:text-red-300 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
