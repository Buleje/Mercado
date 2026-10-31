"use client";

import { useState } from "react";
import { m } from "@/components/admin/providers";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { AlertCircle, FileText, Link2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type NotaCredito, STATUS_META } from "@/components/admin/notas-credito/nc-compartido";

/** Piezas de la lista de Notas de crédito: historial de estados, tarjeta y aviso de borradores. */
// ── StatusTimeline ──────────────────────────────────────────────────────────

export function StatusTimeline({ nc }: { nc: NotaCredito }) {
  // La base guarda la creación y el último cambio (`updatedAt`), no quién emitió ni anuló: no se inventan.
  // Antes el tercer paso decía «Pagada», un estado que no existe: la nota no mueve plata (F16, 17-10).
  const cambio = nc.emitidaAt ?? nc.anuladaAt ?? nc.updatedAt;
  const steps = [
    { label: "Creada en borrador", date: nc.createdAt, by: nc.createdBy, done: true },
    nc.status === "ANULADA"
      ? { label: "Anulada: ya no resta del documento", date: cambio, by: nc.anuladaPor, done: true }
      : { label: "Marcada emitida", date: nc.status === "EMITIDA" ? cambio : undefined, by: nc.emitidaPor, done: nc.status === "EMITIDA" },
  ];
  return (
    <div className="relative pl-6 space-y-4">
      <div className="absolute left-2.75 top-2 bottom-2 w-0.5 bg-[var(--rule-soft)]" />
      {steps.map((step, i) => (
        <div key={i} className="relative flex items-start gap-3">
          <div className={cn("absolute -left-3.25 w-4 h-4 rounded-full border-2 flex items-center justify-center",
            step.done ? "bg-primary border-primary" : "bg-[var(--surface-raised)] border-[var(--rule-base)]")}>
            {step.done && <span className="text-white text-sm">{"\u2713"}</span>}
          </div>
          <div>
            <p className={cn("text-sm font-bold", step.done ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{step.label}</p>
            {step.date && <p className="text-sm text-[var(--text-tertiary)]">{formatDateTime(step.date)}</p>}
            {step.by && <p className="text-sm text-[var(--text-tertiary)]">Por: {step.by}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NCCard ──────────────────────────────────────────────────────────────────

export function NCCard({ nc, onSelect, selected, onToggle }: { nc: NotaCredito; onSelect: () => void; selected: boolean; onToggle: () => void }) {
  const meta = STATUS_META[nc.status];
  return (
    <m.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className={cn("bg-[var(--surface-raised)] border rounded-xl p-4 cursor-pointer transition-all hover:shadow-[var(--shadow-sm)]",
        selected ? "border-primary ring-2 ring-primary/20" : "border-[var(--rule-base)]")}>
      <div className="flex items-start gap-3">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label={`Elegir ${nc.numero}`} aria-pressed={selected}
          className="-m-3 flex h-12 w-12 shrink-0 items-center justify-center">
          <span className={cn("flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
            selected ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
            {selected && <span className="text-sm leading-none">{"\u2713"}</span>}
          </span>
        </button>
        <div
          className="flex-1 min-w-0"
          onClick={onSelect}
          role="button"
          tabIndex={0}
          aria-label={`Ver detalle de ${nc.numero}`}
          onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{nc.numero}</span>
            </span>
            <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-lg text-sm font-bold", meta.bg, meta.color)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] truncate mb-1">[{nc.motivoCodigo}] {nc.motivoDesc}</p>
          {nc.clienteNombre && <p className="text-sm text-[var(--text-tertiary)] mb-1">{nc.clienteNombre}</p>}
          {nc.orderNumero && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-bold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] mb-2">
              <Link2 className="h-4 w-4" aria-hidden /> {nc.orderNumero}
            </span>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)]">
            <span className="text-sm text-[var(--text-tertiary)]">{formatDate(nc.createdAt)}</span>
            <span className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(nc.total)}</span>
          </div>
        </div>
      </div>
    </m.div>
  );
}

// ── StaleDraftsBanner ───────────────────────────────────────────────────────

export function StaleDraftsBanner({ notas, onFilter }: { notas: NotaCredito[]; onFilter: () => void }) {
  // Capture "now" once per mount via lazy state init (avoids impure Date.now() during render)
  const [nowTs] = useState(() => Date.now());
  const stale = notas.filter(nc => nc.status === "BORRADOR" && (nowTs - new Date(nc.createdAt).getTime()) > 48 * 3600000);
  if (stale.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] text-sm">
      <AlertCircle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
      <span className="text-[var(--data-warning-ink)]">
        Tienes <strong>{stale.length}</strong> borrador{stale.length !== 1 ? "es" : ""} sin emitir desde hace m{"\u00e1"}s de 48 horas.
      </span>
      <button onClick={onFilter} className="ml-auto inline-flex min-h-12 items-center px-2 text-sm font-bold text-[var(--data-warning-ink)] hover:underline shrink-0">Ver borradores</button>
    </div>
  );
}
