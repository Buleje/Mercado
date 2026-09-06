"use client";

/**
 * Editar el motivo / notas de un adelanto ya creado.
 *
 * `PATCH /api/adelantos/[id]` ya aceptaba `notas` — el endpoint se llama
 * "editar notas" en su propio comentario — pero ninguna pantalla lo llamaba
 * sin `cancelar`. Un motivo mal tipeado o una nota que quedó corta se
 * quedaba así para siempre.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Pencil } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { inputCls } from "../shared";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

export default function EditarNotasModal({
  adelantoId,
  notasActuales,
  onClose,
  onGuardado,
}: {
  adelantoId: string;
  notasActuales: string | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [notas, setNotas] = useState(notasActuales ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const guardar = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/adelantos/${adelantoId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({ notas: notas.trim() || null }),
      });
      if (res.ok) {
        onGuardado();
        return;
      }
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo guardar.");
    } catch (e) {
      logger.error("[adelantos] no se pudo editar notas", { error: String(e) });
      setErr("No se pudo guardar. Revisá la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Editar motivo / notas"
        className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-xl)]"
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <Pencil className="h-4.5 w-4.5" />
          </span>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Editar motivo / notas</p>
        </div>

        <textarea
          autoFocus
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={4}
          placeholder="Para qué era la plata…"
          aria-label="Motivo / notas del adelanto"
          className={`${inputCls} h-auto py-3`}
        />

        {err && (
          <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-[var(--data-error)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={saving}
            className="h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
