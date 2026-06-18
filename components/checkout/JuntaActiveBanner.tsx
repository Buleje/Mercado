"use client";

import { useEffect, useState } from "react";
import { Users, X } from "@buleje/design-system/icons";
import { getActiveJunta, clearActiveJunta } from "@/lib/junta/active";

/**
 * Banner en el checkout cuando el cliente compra para una Junta del Barrio
 * (Fase A5). El pedido se taggea con esta junta. "Quitar" cancela el tag.
 * Self-contained: se auto-oculta si no hay junta activa.
 */
export function JuntaActiveBanner() {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    setCode(getActiveJunta());
  }, []);

  if (!code) return null;

  return (
    <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3.5 py-2.5">
      <Users
        className="h-4 w-4 shrink-0 text-[var(--accent)]"
        strokeWidth={2}
        aria-hidden
      />
      <p className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
        Estás comprando para la junta{" "}
        <span className="font-mono font-bold text-[var(--accent)]">{code}</span>
      </p>
      <button
        type="button"
        onClick={() => {
          clearActiveJunta();
          setCode(null);
        }}
        className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--data-error-600)]"
        aria-label="Quitar la junta de este pedido"
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
