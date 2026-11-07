"use client";

import { useState } from "react";
import { Check, Pencil, X } from "@buleje/design-system/icons";
import { MAX_NOMBRE_SIN_MARCAR, NOMBRE_SIN_MARCAR } from "@/lib/forestal/reparto-por-distribuir";

/** El nombre del bloque con un lápiz: Enter guarda, Escape cancela, vacío vuelve al de siempre. */
export default function NombreEditable({ nombre, onGuardar }: { nombre: string; onGuardar: (n: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(nombre);
  const cerrar = (guardar: boolean) => {
    if (guardar) onGuardar(borrador);
    setEditando(false);
  };
  if (!editando) {
    return (
      <>
        <span>{nombre}</span>
        <button
          type="button"
          onClick={() => { setBorrador(nombre); setEditando(true); }}
          aria-label="Cambiar nombre"
          title="Cambiar nombre"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      </>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        autoFocus
        value={borrador}
        maxLength={MAX_NOMBRE_SIN_MARCAR}
        placeholder={NOMBRE_SIN_MARCAR}
        aria-label="Nombre del bloque"
        onChange={(e) => setBorrador(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); cerrar(true); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(false); }
        }}
        className="h-12 w-56 max-w-full rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] px-3 text-base font-bold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
      />
      <button type="button" onClick={() => cerrar(true)} aria-label="Guardar nombre" className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-dark)] text-white hover:brightness-110">
        <Check className="h-5 w-5" aria-hidden />
      </button>
      <button type="button" onClick={() => cerrar(false)} aria-label="Cancelar" className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]">
        <X className="h-5 w-5" aria-hidden />
      </button>
    </span>
  );
}
