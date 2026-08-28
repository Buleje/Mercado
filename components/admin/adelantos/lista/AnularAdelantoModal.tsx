"use client";

/**
 * Anular un adelanto — con la pregunta que el `confirm()` de antes no hacía.
 *
 * El backend (`PATCH /api/adelantos/[id]`) ya aceptaba `devolucionCaja` desde
 * el ADR-118: por qué vía volvió la plata al cajón, para que el arqueo del día
 * cuadre. Ausente = no toca la caja. La única pantalla que anulaba (el detalle)
 * mandaba `{ cancelar: true }` a secas con un `window.confirm()* — el campo
 * vivía en el backend y nunca se preguntaba.
 *
 * Anular NO es lo mismo que "la plata volvió": puede ser un error de tipeo
 * (nunca salió nada) o una pérdida que se da por perdida (no vuelve). Por eso
 * la pregunta es explícita y el default es "no volvió nada" — jamás se anota
 * un ingreso de caja que no pasó.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Ban } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { fmtMon } from "../shared";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

const VIAS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "yape", label: "Yape" },
  { id: "plin", label: "Plin" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "transferencia", label: "Transferencia" },
] as const;

export default function AnularAdelantoModal({
  adelantoId,
  persona,
  monto,
  moneda,
  onClose,
  onAnulado,
}: {
  adelantoId: string;
  persona: string;
  monto: number;
  moneda: string;
  onClose: () => void;
  onAnulado: () => void;
}) {
  const [via, setVia] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const anular = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/adelantos/${adelantoId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({ cancelar: true, devolucionCaja: via }),
      });
      if (res.ok) {
        onAnulado();
        return;
      }
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo anular el adelanto.");
    } catch (e) {
      logger.error("[adelantos] no se pudo anular", { error: String(e) });
      setErr("No se pudo anular. Revisá la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label="Anular adelanto"
        className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-xl)]"
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--data-error)]/10 text-[var(--data-error)]">
            <Ban className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-[var(--text-primary)]">¿Anular este adelanto?</p>
            <p className="text-sm text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">{persona}</strong> — {fmtMon(monto, moneda)}. No se borra el
              historial, queda marcado como cancelado.
            </p>
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl bg-[var(--surface-sunken)] p-3.5" role="group" aria-label="¿Volvió la plata a caja?">
          <p className="text-sm font-bold text-[var(--text-secondary)]">¿La plata volvió a caja?</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setVia(null)}
              aria-pressed={via === null}
              className={`h-9 rounded-lg px-3 text-sm font-bold transition-colors ${
                via === null ? "bg-primary/12 text-[var(--accent-ink)] ring-2 ring-primary dark:text-[var(--accent)]" : "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
              }`}
            >
              No volvió nada
            </button>
            {VIAS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVia(v.id)}
                aria-pressed={via === v.id}
                className={`h-9 rounded-lg px-3 text-sm font-bold transition-colors ${
                  via === v.id ? "bg-primary/12 text-[var(--accent-ink)] ring-2 ring-primary dark:text-[var(--accent)]" : "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            {via ? "Se anota un ingreso de caja por esa vía, para que el arqueo cuadre." : "Se anula sin tocar la caja — es un error de carga o una pérdida que se da por perdida."}
          </p>
        </div>

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
            Volver
          </button>
          <button
            type="button"
            onClick={() => void anular()}
            disabled={saving}
            className="h-11 flex-1 rounded-xl bg-[var(--data-error)] text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Anulando…" : "Anular adelanto"}
          </button>
        </div>
      </div>
    </div>
  );
}
