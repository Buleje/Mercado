"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderArchive, X, Link2, Copy, Check, Loader2, MessageCircle, Lock } from "@buleje/design-system/icons";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { csrfHeaders } from "@/lib/csrf-client";

/**
 * Compartir una carpeta completa por link público (`/c/{token}`, 30 días).
 * Crea el share al abrir; ofrece copiar el enlace y mandarlo por WhatsApp.
 */
export function FolderShareModal({ folder, onClose }: { folder: DbDocumentFolder; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Con clave, el enlace se genera recién al escribirla: uno creado sin clave
   *  ya quedaría abierto aunque después se genere otro. */
  const [conClave, setConClave] = useState(false);
  const [clave, setClave] = useState("");

  const generar = useCallback(async (password?: string) => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents/folders/${folder.id}/share`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresInDays: 30, ...(password ? { password } : {}) }),
      });
      if (!res.ok) throw new Error("No se pudo generar el enlace");
      const d = await res.json();
      setLink(`${window.location.origin}/c/${d.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, [folder.id]);

  useEffect(() => {
    if (conClave) { setCreating(false); return; }
    if (link) return;
    generar();
  }, [conClave, link, generar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard bloqueado */ }
  };
  const whatsapp = () => {
    if (!link) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Te comparto la carpeta "${folder.name}": ${link}`)}`, "_blank", "noopener");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[32rem] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><FolderArchive className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">Compartir carpeta</p>
            <p className="truncate text-xs text-[var(--text-tertiary)]">{folder.name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-xs text-[var(--text-secondary)]">
            {conClave
              ? "Sólo quien tenga la clave podrá ver y descargar los documentos. Caduca en 30 días."
              : "Cualquiera con este enlace podrá ver y descargar los documentos de la carpeta. Caduca en 30 días."}
          </p>

          <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            <div className="flex items-start gap-2.5">
              <input
                id="carpeta-con-clave"
                type="checkbox"
                checked={conClave}
                onChange={(e) => { setConClave(e.target.checked); setClave(""); setLink(null); }}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <div className="min-w-0">
                <label htmlFor="carpeta-con-clave" className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                  <Lock className="h-3.5 w-3.5" /> Pedir una clave para abrirla
                </label>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Pasale la clave por otro lado, no en el mismo mensaje que el enlace.</p>
              </div>
            </div>

            {conClave && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="Clave (mínimo 4 caracteres)"
                  className="h-11 min-w-[180px] flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none"
                />
                <button
                  onClick={() => generar(clave.trim())}
                  disabled={creating || clave.trim().length < 4}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-40"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {link ? "Rehacer con clave" : "Generar el enlace"}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              <Link2 className="h-3.5 w-3.5" /> Enlace de la carpeta
            </div>
            {creating ? (
              <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" /> Generando enlace…</p>
            ) : !link && conClave ? (
              <p className="text-sm text-[var(--text-tertiary)]">Escribí la clave acá arriba y generá el enlace.</p>
            ) : error ? (
              <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
            ) : (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-[var(--surface-raised)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">{link}</code>
                <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-[var(--rule-base)] px-2 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cerrar</button>
          <button onClick={whatsapp} disabled={creating || !link} className="inline-flex items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-[var(--data-success-500)]">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
