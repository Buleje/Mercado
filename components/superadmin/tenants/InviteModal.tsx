"use client";

import { useState } from "react";
import { X, Mail, Loader2, CheckCircle2, Copy } from "lucide-react";

interface InviteModalProps {
  tenantSlug: string;
  tenantName: string;
  onClose: () => void;
}

export function InviteModal({ tenantSlug, tenantName, onClose }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [sending, setSending] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) { setError("Introduce un email"); return; }
    setSending(true); setError("");
    try {
      const res = await fetch("/api/invite", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "x-tenant-id": tenantSlug }, body: JSON.stringify({ email: email.trim(), role }) });
      const data = await res.json() as { inviteUrl?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setInviteUrl(data.inviteUrl ?? null);
    } catch { setError("Error de red"); }
    finally { setSending(false); }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(inviteUrl ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-teal-800/30 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Invitar usuario</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              <span className="text-gray-700 dark:text-gray-300">{tenantName}</span>{" "}
              <span className="font-mono">({tenantSlug})</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!inviteUrl ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email del invitado</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rol</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                >
                  <option value="admin">Administrador</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl disabled:opacity-50 text-white text-sm font-semibold"
              style={{ background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)" }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Generar enlace
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Enlace generado.
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-3 text-xs font-mono break-all">{inviteUrl}</div>
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-sm font-semibold"
            >
              <Copy className="w-4 h-4" /> {copied ? "¡Copiado!" : "Copiar enlace"}
            </button>
            <p className="text-gray-400 text-xs text-center">El enlace expira en 72 horas.</p>
          </div>
        )}
      </div>
    </div>
  );
}
