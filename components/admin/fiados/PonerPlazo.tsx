"use client";

/**
 * Celda «Vencimiento» de un fiado que no tiene fecha (auditoría 15-10, M33).
 * Dice cuánto lleva abierto (antigüedad, no mora) y deja ponerle el plazo ahí
 * mismo. Antes la celda decía «—» y el aviso de «Por vencer» mandaba a
 * ponerle fecha desde un lugar donde no se podía.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { diasEntre } from "@/lib/fiados/gestion-cobranza";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";

const UN_ANIO_MS = 365 * 86_400_000;

export default function PonerPlazo({ fiadoId, creado, onGuardado }: { fiadoId: string; creado: string; onGuardado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [dia, setDia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const hoy = limaDateKey();
  const lleva = Math.max(0, diasEntre(limaDateKey(creado), hoy));
  const max = new Date(Date.parse(`${hoy}T12:00:00Z`) + UN_ANIO_MS).toISOString().slice(0, 10);

  const guardar = async () => {
    if (!dia) return;
    setGuardando(true);
    try {
      const r = await fetch(`/api/fiados/${fiadoId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ fechaVence: dia }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo poner la fecha");
        return;
      }
      toast.success("Fecha puesta: ya sale en «Por vencer»");
      setAbierto(false);
      onGuardado();
    } catch (e) {
      logger.error("[fiados] poner plazo falló", { error: String(e) });
      toast.error("No se pudo poner la fecha");
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <span className="flex flex-col items-start gap-0.5">
        <span className="text-sm text-[var(--text-secondary)]" title="Sin fecha de vencimiento: los días son desde que se abrió, no de atraso">
          Sin plazo · lleva {lleva === 0 ? "hoy" : `${lleva} d`}
        </span>
        <button type="button" data-qa="poner-plazo" onClick={() => setAbierto(true)}
          className="text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">
          Poner fecha
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input type="date" value={dia} min={hoy} max={max} autoFocus aria-label="Fecha de vencimiento"
        onChange={(e) => setDia(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") setAbierto(false); }}
        className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/30" />
      <button type="button" onClick={() => void guardar()} disabled={!dia || guardando} aria-label="Guardar fecha" title="Guardar fecha"
        className={button({ variant: "accent", size: "icon" })}>
        <Check className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={() => setAbierto(false)} aria-label="Cancelar" title="Cancelar"
        className={button({ variant: "ghost", size: "icon" })}>
        <X className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}
