"use client";

import { useState } from "react";
import { Stamp, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { stampDoc } from "@/hooks/use-documents";
import type { DbDocument } from "@/lib/types/documents";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";

/**
 * Modal para aplicar un sello / marca de agua sobre un PDF. Presets client-safe
 * (el color real lo pone el server en `pdf-stamp.ts`). Genera una nueva versión.
 */
const PRESETS: { key: string; label: string; swatch: string }[] = [
  { key: "pagado", label: "PAGADO", swatch: "bg-[var(--data-success-500)]" },
  { key: "aprobado", label: "APROBADO", swatch: "bg-teal-500" },
  { key: "recibido", label: "RECIBIDO", swatch: "bg-blue-500" },
  { key: "copia", label: "COPIA", swatch: "bg-slate-400" },
  { key: "confidencial", label: "CONFIDENCIAL", swatch: "bg-indigo-500" },
  { key: "borrador", label: "BORRADOR", swatch: "bg-amber-500" },
  { key: "urgente", label: "URGENTE", swatch: "bg-orange-500" },
  { key: "anulado", label: "ANULADO", swatch: "bg-[var(--data-error-500)]" },
];

export function StampModal({ doc, onClose, onDone }: { doc: DbDocument; onClose: () => void; onDone: () => void }) {
  const [preset, setPreset] = useState("pagado");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await stampDoc(doc.id, preset, custom.trim() || undefined);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : "Error al aplicar el sello");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Poner sello"
      icon={Stamp}
      variant="default"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button onClick={apply} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 min-h-10 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
            {busy ? "Aplicando…" : "Aplicar sello"}
          </button>
        </div>
      }
    >
      <div className={MODAL_BODY}>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          Se estampa una marca de agua diagonal en todas las páginas de <span className="font-semibold">{doc.name}</span> y se guarda como una nueva versión.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPreset(p.key); setCustom(""); }}
              className={cn(
                "flex items-center gap-2 rounded-xl border-2 px-3 min-h-10 text-sm font-semibold transition-colors",
                preset === p.key && !custom ? "border-primary bg-primary/5" : "border-[var(--rule-base)] hover:border-primary/40",
              )}
            >
              <span className={cn("h-3 w-3 rounded-full", p.swatch)} />
              <span className="text-[var(--text-primary)]">{p.label}</span>
            </button>
          ))}
        </div>

        <label className="mt-3 block text-xs font-semibold text-[var(--text-secondary)]">
          O texto personalizado (opcional)
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.slice(0, 24))}
            placeholder="Ej: PROFORMA"
            maxLength={24}
            className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] dark:bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] uppercase outline-none focus:border-primary"
          />
        </label>

        {error && <p className="mt-2 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      </div>
    </AdminModal>
  );
}
