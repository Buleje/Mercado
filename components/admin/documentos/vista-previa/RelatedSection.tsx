"use client";

import { useState } from "react";
import { X, FileText, Plus, Link as LinkChain } from "@buleje/design-system/icons";
import { relateDoc } from "@/hooks/use-documents";
import { type DbDocument } from "@/lib/types/documents";

export function getRelatedIds(doc: DbDocument): string[] {
  const r = doc.ocrMetadata?.relatedIds;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : [];
}

export function RelatedSection({ doc, allDocs, onChanged }: { doc: DbDocument; allDocs: DbDocument[]; onChanged: (d: DbDocument) => void }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const relatedIds = getRelatedIds(doc);
  const related = relatedIds.map((id) => allDocs.find((d) => d.id === id)).filter((d): d is DbDocument => !!d);
  const candidates = allDocs.filter((d) => d.id !== doc.id && !relatedIds.includes(d.id));

  async function toggle(relatedId: string, link: boolean) {
    setBusy(true);
    try {
      await relateDoc(doc.id, relatedId, link);
      const nextIds = link ? [...relatedIds, relatedId] : relatedIds.filter((x) => x !== relatedId);
      onChanged({ ...doc, ocrMetadata: { ...doc.ocrMetadata, relatedIds: nextIds } });
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <LinkChain className="h-4 w-4 text-primary" /> Documentos relacionados
      </p>
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">Vincula este documento con otros (contrato ↔ adenda, factura ↔ recibo).</p>

      {related.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {related.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5">
              <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{d.name}</span>
              <span className="shrink-0 text-[length:var(--ts-2xs,11px)] capitalize text-[var(--text-tertiary)]">{d.category}</span>
              <button onClick={() => toggle(d.id, false)} disabled={busy} className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] disabled:opacity-50" aria-label="Quitar vínculo"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <select
          // eslint-disable-next-line jsx-a11y/no-autofocus -- el selector aparece para elegir el documento a vincular de inmediato
          autoFocus
          aria-label="Elegir documento para vincular"
          defaultValue=""
          onChange={(e) => { if (e.target.value) toggle(e.target.value, true); }}
          disabled={busy}
          className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary dark:bg-[var(--surface-sunken)]"
        >
          <option value="" disabled>Elige un documento…</option>
          {candidates.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      ) : (
        <button onClick={() => setAdding(true)} disabled={candidates.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-base)] px-3 py-1.5 text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary disabled:opacity-40">
          <Plus className="h-4 w-4" /> Vincular documento
        </button>
      )}
    </section>
  );
}

// ── Flujo de aprobación (borrador → revisión → aprobado) ─────────────────────