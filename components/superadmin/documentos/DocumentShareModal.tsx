"use client";

import { useEffect, useRef, useState } from "react";
import {
  Share2,
  Copy,
  Check,
  Trash2,
  Lock,
  X,
  Loader2,
  Plus,
} from "@buleje/design-system/icons";
import type { DbDocument, DbDocumentShare } from "@/lib/types/documents";
import { csrfHeaders } from "@/lib/csrf-client";
import { fmtDate } from "./shared";

interface Props {
  doc: DbDocument;
  onClose: () => void;
}

const FIELD =
  "w-full h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)]";

const DAYS_OPTIONS = [
  { value: 1, label: "1 día" },
  { value: 7, label: "7 días" },
  { value: 30, label: "30 días" },
  { value: 90, label: "90 días" },
];

export default function DocumentShareModal({ doc, onClose }: Props) {
  const [shares, setShares] = useState<DbDocumentShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    void fetchShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchShares() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/documents/${doc.id}/share`, {
        headers: csrfHeaders({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { shares: DbDocumentShare[] };
      setShares(data.shares);
    } catch (err) {
      console.error("[sa-share] fetch shares failed", err);
      setError("No se pudo cargar la lista de links.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const body: { expiresInDays?: number; password?: string } = { expiresInDays };
      if (password.trim()) body.password = password.trim();
      const res = await fetch(`/api/superadmin/documents/${doc.id}/share`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { share: DbDocumentShare };
      setShares((prev) => [data.share, ...prev]);
      setPassword("");
    } catch (err) {
      console.error("[sa-share] create share failed", err);
      setError("No se pudo generar el link.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(shareId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/documents/share/${shareId}`, {
        method: "DELETE",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShares((prev) =>
        prev.map((s) =>
          s.id === shareId ? { ...s, revokedAt: new Date().toISOString() } : s,
        ),
      );
    } catch (err) {
      console.error("[sa-share] revoke failed", err);
      setError("No se pudo revocar el link.");
    }
  }

  function handleCopy(token: string, shareId: string) {
    const url = `${window.location.origin}/d/${token}`;
    navigator.clipboard.writeText(url).catch((err) =>
      console.error("[sa-share] copy failed", err),
    );
    setCopiedId(shareId);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const activeShares = shares.filter((s) => !s.revokedAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Compartir documento"
        className="w-full max-w-lg rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-lg)] p-5 space-y-4 max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-[var(--text-secondary)]" />
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Compartir documento
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] shrink-0 truncate">{doc.name}</p>

        {/* Error banner */}
        {error && (
          <p className="shrink-0 text-sm text-[var(--data-error-500)] bg-[var(--data-error-soft)] rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* Create form */}
        <div className="shrink-0 space-y-3 rounded-xl border-2 border-[var(--rule-base)] p-4 bg-[var(--accent-soft)]">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Crear link</p>
          <div className="flex gap-2">
            <label className="flex-1 space-y-1">
              <span className="text-sm text-[var(--text-tertiary)]">Vencimiento</span>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className={FIELD}
              >
                {DAYS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 space-y-1">
              <span className="text-sm text-[var(--text-tertiary)]">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña (opcional)"
                className={FIELD}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            aria-label="Generar link público"
            className="flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Generar link
          </button>
        </div>

        {/* Shares list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : activeShares.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-6">
              No hay links activos.
            </p>
          ) : (
            activeShares.map((share) => {
              const copied = copiedId === share.id;
              return (
                <div
                  key={share.id}
                  className="flex items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3"
                >
                  {/* Link info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-[var(--text-primary)] truncate">
                      {`/d/${share.token}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-sunken)] rounded-full px-2 py-0.5">
                        Vence {fmtDate(share.expiresAt)}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {share.accessCount} {share.accessCount === 1 ? "acceso" : "accesos"}
                      </span>
                      {share.hasPassword && (
                        <Lock
                          className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                          aria-label="Protegido con contraseña"
                        />
                      )}
                    </div>
                  </div>

                  {/* Copy button */}
                  <button
                    type="button"
                    onClick={() => handleCopy(share.token, share.id)}
                    aria-label="Copiar link"
                    className="shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-xl border-2 border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-[var(--data-success-500)]" />
                        <span className="text-[var(--data-success-500)]">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar
                      </>
                    )}
                  </button>

                  {/* Revoke button */}
                  <button
                    type="button"
                    onClick={() => void handleRevoke(share.id)}
                    aria-label="Revocar link"
                    className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--data-error-500)] hover:bg-[var(--data-error-soft)] transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
