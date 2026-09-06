"use client";

import { useState } from "react";
import { X, Stamp, Loader2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { stampDoc } from "@/hooks/use-documents";
import type { DbDocument } from "@/lib/types/documents";

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[28rem] rounded-2xl bg-white dark:bg-[var(--color-card)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle as="h3" className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            <Stamp className="h-5 w-5 text-primary" /> Poner sello
          </CardTitle>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          Se estampa una marca de agua diagonal en todas las páginas de <span className="font-semibold">{doc.name}</span> y se guarda como una nueva versión.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPreset(p.key); setCustom(""); }}
              className={cn(
                "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors",
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
            className="mt-1 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] uppercase outline-none focus:border-primary"
          />
        </label>

        {error && <p className="mt-2 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button onClick={apply} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
            {busy ? "Aplicando…" : "Aplicar sello"}
          </button>
        </div>
      </div>
    </div>
  );
}
