"use client";

import { m } from "@/components/admin/providers";
import { formatCurrency, formatDate } from "@/lib/format";
import { Calendar, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type SaleDoc, DOC_STYLE, MOTIVOS_SUNAT } from "@/components/admin/notas-credito/nc-compartido";

/** Piezas del asistente «Nueva nota de crédito». */
// ── WizardProgress ──────────────────────────────────────────────────────────

export const WIZARD_STEPS = ["Documento", "Motivo & Items", "Confirmar"] as const;

export function WizardProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {WIZARD_STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2 flex-1">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-[var(--dur-base)]",
            i < step ? "bg-primary text-white " :
            i === step ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] border-2 border-primary" :
            "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]")}>
            {i < step ? "\u2713" : i + 1}
          </div>
          <span className={cn("text-xs font-semibold hidden sm:block", i <= step ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{label}</span>
          {i < WIZARD_STEPS.length - 1 && (
            <div className="flex-1 h-0.5 rounded-full overflow-hidden bg-[var(--rule-soft)]">
              <m.div className="h-full bg-primary" initial={{ width: "0%" }} animate={{ width: i < step ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── SaleDocCard (Visual Document Picker Card) ───────────────────────────────

export function SaleDocCard({ doc, isSelected, onSelect }: { doc: SaleDoc; isSelected: boolean; onSelect: () => void }) {
  const style = DOC_STYLE[doc.comprobanteTipo] || DOC_STYLE.ticket;
  return (
    <m.button type="button" layout onClick={onSelect}
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      className={cn(
        "w-full text-left rounded-xl border-2 p-4 transition-all duration-[var(--dur-base)] relative overflow-hidden",
        isSelected
          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
          : cn(style.bg, style.border, "hover:shadow-[var(--shadow-lg)]")
      )}>
      {/* Color accent strip */}
      <div className={cn("absolute top-0 left-0 w-1.5 h-full rounded-l-2xl", isSelected ? "bg-primary" :
        doc.comprobanteTipo === "factura" ? "bg-primary/10" : doc.comprobanteTipo === "boleta" ? "bg-primary/10" : "bg-[var(--data-warning-500)]"
      )} />
      <div className="flex items-start gap-3 pl-2">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ",
          isSelected ? "bg-primary/10" : style.badge)}>
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={cn("px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold", style.badge)}>
              {style.label}
            </span>
            <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
              {doc.comprobanteNumero || `#${doc.número}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)] mb-2">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{doc.fecha ? formatDate(doc.fecha) : "\u2014"}</span>
            <span className="text-[var(--text-tertiary)]">{"\u00b7"}</span>
            <span className="truncate">{doc.clienteNombre}</span>
            {doc.clienteDocumento && <span className="text-[var(--text-tertiary)]">({doc.clienteDocumento})</span>}
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              <Package className="h-3 w-3" />
              {doc.items.length} item{doc.items.length !== 1 ? "s" : ""}
            </span>
            <span className={cn("text-base font-extrabold", isSelected ? "text-primary" : "text-[var(--text-primary)]")}>
              {formatCurrency(doc.total)}
            </span>
          </div>
          {/* Mini item preview */}
          {doc.items.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[var(--rule-base)]/50 flex items-center gap-1 overflow-hidden">
              {doc.items.slice(0, 3).map((it, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-white/70 rounded text-[length:var(--ts-2xs)] text-[var(--text-secondary)] truncate max-w-25 border border-[var(--rule-soft)]">
                  {it.nombre}
                </span>
              ))}
              {doc.items.length > 3 && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">+{doc.items.length - 3}</span>}
            </div>
          )}
        </div>
        {isSelected && (
          <m.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
            <span className="text-xs font-bold">{"\u2713"}</span>
          </m.div>
        )}
      </div>
    </m.button>
  );
}

// ── MotivoCard (Visual Motivo Picker) ───────────────────────────────────────

export function MotivoCard({ motivo, selected, onClick }: { motivo: typeof MOTIVOS_SUNAT[number]; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "text-left p-3 rounded-xl border-2 transition-all duration-[var(--dur-base)]",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20 "
          : "border-[var(--rule-base)] hover:border-[var(--rule-base)] hover:bg-[var(--surface-alt)]"
      )}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{motivo.icon}</span>
        <span className={cn("text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded",
          selected ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>{motivo.code}</span>
      </div>
      <p className={cn("text-xs font-semibold mb-0.5", selected ? "text-primary" : "text-[var(--text-primary)]")}>{motivo.label}</p>
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight">{motivo.desc}</p>
    </button>
  );
}

// ── AmountBreakdown (Visual Amount Bar) ─────────────────────────────────────

export function AmountBreakdown({ monto, igv, total, originalTotal }: { monto: number; igv: number; total: number; originalTotal?: number }) {
  const pct = originalTotal && originalTotal > 0 ? Math.min(100, (total / originalTotal) * 100) : 100;
  return (
    <div className="space-y-3">
      {originalTotal != null && originalTotal > 0 && (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[var(--text-tertiary)]">NC respecto al documento original</span>
            <span className="font-bold text-[var(--text-primary)]">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
            <m.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-[var(--data-error-500)]" />
          </div>
          <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
            <span>NC: {formatCurrency(total)}</span>
            <span>Original: {formatCurrency(originalTotal)}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--surface-alt)] rounded-xl p-3 text-center">
          <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-1">Base sin IGV</p>
          <p className="text-lg font-extrabold text-[var(--text-primary)]">{formatCurrency(monto)}</p>
        </div>
        <div className="bg-[var(--data-warning-50)] rounded-xl p-3 text-center">
          <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--data-warning-ink)] mb-1">IGV 18%</p>
          <p className="text-lg font-extrabold text-[var(--data-warning-ink)]">{formatCurrency(igv)}</p>
        </div>
        <div className="bg-[var(--data-error-50)] rounded-xl p-3 text-center border border-[var(--data-error-500)]">
          <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--data-error-500)] mb-1">Total NC</p>
          <p className="text-lg font-extrabold text-[var(--data-error-500)]">{formatCurrency(total)}</p>
        </div>
      </div>
    </div>
  );
}
