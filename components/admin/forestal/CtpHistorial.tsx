"use client";

/**
 * CtpHistorial — historial de cambios de UNA línea del libro (rec #10 del QA
 * 2026-07-17): quién hizo qué y cuándo sobre este registro, leído del audit
 * trail (`ctp-audit` → ActivityLog). No solo quién creó y validó: TODA acción
 * posterior (anulación, re-atribución, congelado de costo, GTF emitida…) —
 * la defensa del titular del CTP ante una fiscalización.
 *
 * Colapsado por defecto ("Historial de cambios (N)"); se monta en las fichas
 * de ingreso, producción y despacho. Si no hay eventos o falla, no estorba.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, History } from "@buleje/design-system/icons";

interface Evento {
  id: string;
  action: string;
  detail: string;
  user: string;
  createdAt: string;
}

/** Etiqueta humana por acción del vocabulario ctp-audit. */
const ACTION_LABELS: Record<string, string> = {
  ctp_ingreso_create: "Registrado",
  ctp_ingreso_validate: "Validado",
  ctp_ingreso_reject: "Rechazado",
  ctp_ingreso_annul: "Anulado",
  ctp_ingreso_delete: "Eliminado",
  ctp_linea_create: "Registrada",
  ctp_linea_annul: "Anulada",
  ctp_linea_delete: "Eliminada",
  ctp_consumos_set: "Atribución de materia prima",
  ctp_origenes_set: "Atribución de origen",
  ctp_costo_congelar: "Costo congelado",
  ctp_gtf_emitir: "GTF de salida emitida",
  ctp_ficha_update: "Ficha actualizada",
  ctp_especie_foto: "Foto de especie",
  ctp_troza_recepcion: "Recepción de trozas",
  ctp_trozas_consumidas: "Trozas a la sierra",
};

/** Acciones que se pintan en rojo (sacan o corrigen el registro). */
const ACTIONS_DANGER = new Set(["ctp_ingreso_reject", "ctp_ingreso_annul", "ctp_ingreso_delete", "ctp_linea_annul", "ctp_linea_delete"]);

// createdAt es timestamp real → hora LOCAL (no el fix UTC de las date-only).
const fmtDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

export default function CtpHistorial({ entityId }: { entityId: string }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/forestal/ctp?historial=${encodeURIComponent(entityId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { historial: [] }))
      .then((j) => setEventos(j.historial ?? []))
      // Señal secundaria: sin historial simplemente no se muestra.
      .catch((err) => console.warn("[ctp-historial] fetch failed", err));
  }, [entityId]);
  useEffect(() => { load(); }, [load]);

  if (eventos.length === 0) return null;

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <History className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
          Historial de cambios ({eventos.length})
        </span>
        <ChevronDown className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ol className="border-t border-[var(--rule-soft)] px-4 py-3">
          {eventos.map((e) => {
            const danger = ACTIONS_DANGER.has(e.action);
            return (
              <li key={e.id} className="relative border-l-2 border-[var(--rule-soft)] pb-3 pl-4 last:pb-0">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[5px] top-1.5 h-2 w-2 rounded-full ${danger ? "bg-[var(--data-error-500)]" : "bg-[var(--accent)]"}`}
                />
                <p className="text-sm">
                  <strong className={danger ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}>
                    {ACTION_LABELS[e.action] ?? e.action}
                  </strong>{" "}
                  <span className="text-xs text-[var(--text-tertiary)]">· {e.user} · {fmtDateTime(e.createdAt)}</span>
                </p>
                {e.detail && <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{e.detail}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
