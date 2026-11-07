"use client";

import { useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { Share2, Lock, Clipboard, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { createShare, revokeShare } from "@/hooks/use-documents";
import { type DbDocumentShare } from "@/lib/types/documents";
import { formatDate } from "@/lib/format";

export function ShareTab({ docId, shares, reload }: { docId: string; shares: DbDocumentShare[]; reload: () => void }) {
  const [days, setDays] = useState(7);
  const [pwd, setPwd] = useState("");
  const [usePwd, setUsePwd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { prompt } = useConfirm();

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function handleCreate() {
    setCreating(true);
    try {
      await createShare(docId, {
        expiresInDays: days,
        ...(usePwd && pwd.length >= 4 ? { password: pwd } : {}),
      });
      setPwd("");
      setUsePwd(false);
      await reload();
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(token: string) {
    const url = `${baseUrl}/d/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // fallback
      await prompt({ title: "Copia este link", label: "Link", defaultValue: url, inputType: "text" });
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-3">Crear link público</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Días de validez</span>
            <input
              type="number" min={1} max={90} value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value))))}
              className="mt-1 w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5">
              <input type="checkbox" checked={usePwd} onChange={(e) => setUsePwd(e.target.checked)} className="accent-[var(--color-primary)]" />
              <Lock className="h-3.5 w-3.5" /> Proteger con contraseña
            </span>
            {usePwd && (
              <input
                type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 4 caracteres"
                className="mt-1 w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
              />
            )}
          </label>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || (usePwd && pwd.length < 4)}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50"
        >
          <Share2 className="h-3.5 w-3.5" /> {creating ? "Generando…" : "Generar link"}
        </button>
      </div>

      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
        <p className="text-sm font-bold text-[var(--text-primary)] px-4 py-3 border-b border-[var(--rule-base)]">Links activos</p>
        {shares.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic px-4 py-6">No hay links generados.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {shares.map((s) => {
              const url = `${baseUrl}/d/${s.token}`;
              const active = !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now();
              return (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={url}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className={cn(
                        "flex-1 min-w-0 px-2 py-1.5 rounded-xl border text-xs font-mono",
                        active ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]" : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] line-through"
                      )}
                    />
                    <button
                      onClick={() => copyLink(s.token)}
                      disabled={!active}
                      className="px-2 py-1.5 rounded-lg bg-[var(--surface-sunken)] hover:bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {copied === s.token ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                      {copied === s.token ? "Copiado" : "Copiar"}
                    </button>
                    {active && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Te comparto este documento: ${url}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1.5 rounded-md bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15 hover:bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)] text-xs font-bold inline-flex items-center gap-1"
                        title="Enviar por WhatsApp"
                      >
                        <Share2 className="h-3 w-3" /> WhatsApp
                      </a>
                    )}
                    {active && (
                      <button
                        onClick={async () => { await revokeShare(s.id); await reload(); }}
                        className="px-2 py-1.5 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 hover:bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)] text-xs font-bold"
                      >
                        Revocar
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    <span>Expira: {formatDate(s.expiresAt)}</span>
                    <span>Accesos: {s.accessCount}</span>
                    {s.hasPassword && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> protegido</span>}
                    {s.revokedAt && <span className="text-[var(--data-error-500)]">Revocado</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────── Sign tab ───────────
