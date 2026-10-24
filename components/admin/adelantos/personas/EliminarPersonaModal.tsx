"use client";

/** Eliminar a una persona de la libreta de adelantos (movido tal cual desde AdelantosModule, 11-10). */
import { useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import { ModalShell } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

export default function EliminarPersonaModal({ persona, onClose, onDeleted }: { persona: BeneficiarioConSaldo; onClose: () => void; onDeleted: () => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    setSaving(true);
    const res = await fetch(`/api/adelantos/beneficiarios/${persona.id}`, { method: "DELETE", headers: jsonHeaders(), credentials: "include" });
    setSaving(false);
    if (res.ok) { onDeleted(); return; }
    const body = await leerJson<{ error?: string }>(res);
    setErr(body?.error ?? "No se pudo eliminar la persona.");
  };
  return (
    <ModalShell title="Eliminar persona" onClose={onClose}>
      <p className="text-base text-[var(--text-secondary)]">
        ¿Seguro que quieres eliminar a <strong className="text-[var(--text-primary)]">{persona.nombre}</strong>? Esta acción no se puede deshacer.
      </p>
      {err && <p className="mt-3 text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="h-12 px-5 rounded-2xl border border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button onClick={submit} disabled={saving} className="h-12 px-5 rounded-2xl bg-[var(--data-error)] text-white text-base font-semibold hover:opacity-90 disabled:opacity-50">
          {saving ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </ModalShell>
  );
}

