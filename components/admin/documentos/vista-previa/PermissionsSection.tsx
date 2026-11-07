"use client";

import { useState } from "react";
import { Lock, Check, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { patchDocument } from "@/hooks/use-documents";
import { DOC_RESTRICTABLE_ROLES } from "@/lib/documents/doc-access";
import { type DbDocument } from "@/lib/types/documents";

export function PermissionsSection({ doc, onChanged }: { doc: DbDocument; onChanged: (d: DbDocument) => void }) {
  const [busy, setBusy] = useState(false);
  const allowed = doc.allowedRoles ?? [];
  const restricted = allowed.length > 0;

  async function setRoles(next: string[]) {
    setBusy(true);
    try {
      const d = await patchDocument(doc.id, { allowedRoles: next });
      onChanged(d);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (role: string) => {
    const next = allowed.includes(role) ? allowed.filter((r) => r !== role) : [...allowed, role];
    setRoles(next);
  };

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Lock className="h-4 w-4 text-primary" /> Permisos
      </p>
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">
        {restricted
          ? "Solo el dueño/admin y los roles marcados pueden ver este documento."
          : "Ahora lo pueden ver todos los del equipo. Marca roles para restringirlo."}
      </p>
      <div className="flex flex-wrap gap-2">
        {DOC_RESTRICTABLE_ROLES.map((r) => {
          const on = allowed.includes(r.role);
          return (
            <button
              key={r.role}
              onClick={() => toggle(r.role)}
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50",
                on ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary/40",
              )}
            >
              {on ? <Check className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />} {r.label}
            </button>
          );
        })}
      </div>
      {restricted && (
        <button onClick={() => setRoles([])} disabled={busy} className="mt-3 text-xs font-semibold text-[var(--text-tertiary)] hover:text-primary disabled:opacity-50">
          Quitar restricción (ver todos)
        </button>
      )}
    </section>
  );
}
