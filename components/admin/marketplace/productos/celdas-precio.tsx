"use client";

import { Minus, TrendingDown, TrendingUp, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateLong } from "@/lib/format";

/** Precio que se edita al tocarlo: a la vista es texto (no un botón más por fila), pero
    con rol, foco y Enter/Espacio para el teclado y el lector de pantalla. */
function editable(alTocar: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: alTocar,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        alTocar();
      }
    },
  };
}


// ── Chip de comparación contra el promedio del marketplace ──────────────
export function CompetitionChip({
  myPrice,
  avg,
  count,
}: {
  myPrice: number;
  avg: number | null;
  count: number;
}) {
  if (!avg || count === 0) return null;
  const diff = ((myPrice - avg) / avg) * 100;
  if (Math.abs(diff) < 3) {
    return (
      <span
        title={`En precio (promedio ${formatCurrency(avg)} en ${count} tienda${count === 1 ? "" : "s"})`}
        className="inline-flex items-center gap-1 text-sm font-bold text-[var(--text-tertiary)] tabular-nums"
      >
        <Minus className="h-3 w-3" />
        En precio
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span
        title={`Caro · ${diff.toFixed(0)}% sobre el promedio ${formatCurrency(avg)} (${count} tienda${count === 1 ? "" : "s"})`}
        className="inline-flex items-center gap-1 text-sm font-bold text-[var(--data-warning-ink)] tabular-nums"
      >
        <TrendingUp className="h-3 w-3" />
        {diff.toFixed(0)}% caro
      </span>
    );
  }
  return (
    <span
      title={`Barato · ${Math.abs(diff).toFixed(0)}% bajo el promedio ${formatCurrency(avg)} (${count} tienda${count === 1 ? "" : "s"})`}
      className="inline-flex items-center gap-1 text-sm font-bold text-[var(--data-success-ink)] tabular-nums"
    >
      <TrendingDown className="h-3 w-3" />
      {Math.abs(diff).toFixed(0)}% barato
    </span>
  );
}

// ── Celda de precio editable inline ──────────────────────────────────────
/**
 * OfertaCell — poner, cambiar o sacar la rebaja de un producto.
 *
 * Hasta ahora `discountPrice` no se podía cargar desde ninguna pantalla, así que
 * la vidriera tenía el tachado y el chip «-30%» listos para nada (148 productos,
 * 0 ofertas). Acá se carga.
 *
 * Muestra el % calculado mientras se tipea —igual que el S//m³ del libro
 * forestal— porque un 19.90 sobre 24.90 no dice nada y un «-20%» sí. Y distingue
 * la oferta VENCIDA de la vigente: el precio que se cobra sale de
 * `precioVigente()`, no de que el campo esté lleno.
 */
export function OfertaCell({
  lista,
  oferta,
  hasta,
  isEditing,
  editValue,
  busy,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
  onQuitar,
}: {
  lista: number;
  oferta: number | null;
  hasta: string | null;
  isEditing: boolean;
  editValue: string;
  busy: boolean;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onQuitar: () => void;
}) {
  if (isEditing) {
    const n = Number(editValue);
    // El % en vivo delata el dedazo: 199 en vez de 19.90 salta como "-699%".
    const pct = Number.isFinite(n) && n > 0 && lista > 0 ? Math.round(((lista - n) / lista) * 100) : null;
    return (
      <div className="inline-flex items-center gap-1 justify-end">
        <span className="text-xs font-bold text-[var(--text-tertiary)]">S/</span>
        <input
          type="number"
          aria-label="Precio de oferta"
          autoFocus
          min={0}
          step={0.5}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommit(); }
            if (e.key === "Escape") onCancel();
          }}
          onBlur={onCommit}
          disabled={busy}
          className="w-24 h-12 px-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] text-sm font-extrabold text-right tabular-nums outline-none"
        />
        {pct != null && (
          <span className={cn(
            "text-sm font-bold tabular-nums",
            pct > 0 && pct < 100 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]",
          )}>
            {pct > 0 ? `-${pct}%` : "no baja"}
          </span>
        )}
      </div>
    );
  }

  if (oferta == null) {
    return (
      <span
        {...editable(onStartEdit)}
        title="Toca para poner este producto en oferta"
        className="inline-flex min-h-12 cursor-pointer items-center whitespace-nowrap text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      >
        —
      </span>
    );
  }

  const vencida = hasta != null && new Date(hasta).getTime() <= Date.now();
  const pct = lista > 0 ? Math.round(((lista - oferta) / lista) * 100) : 0;
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <div className="inline-flex items-center gap-1.5">
        <span
          {...editable(onStartEdit)}
          title="Toca para editar la oferta"
          className="inline-flex min-h-12 cursor-pointer items-center whitespace-nowrap tabular-nums font-extrabold text-[var(--text-primary)] transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          {formatCurrency(oferta)}
        </span>
        <button
          type="button"
          onClick={onQuitar}
          disabled={busy}
          title="Quitar la oferta"
          aria-label="Quitar la oferta"
          className="inline-flex h-12 w-10 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-ink)] transition-colors disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {/* Vencida ≠ cargada: el cliente paga el precio de lista igual. */}
      <span className={cn(
        "text-sm font-bold tabular-nums",
        vencida ? "text-[var(--data-error-ink)]" : "text-[var(--data-success-ink)]",
      )}>
        {vencida ? "vencida · no se aplica" : `-${pct}%`}
      </span>
    </div>
  );
}

export function PriceCell({
  value,
  isEditing,
  editValue,
  busy,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
  alwaysBold = false,
}: {
  value: number;
  isEditing: boolean;
  editValue: string;
  busy: boolean;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  alwaysBold?: boolean;
}) {
  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-1 justify-end">
        <span className="text-xs font-bold text-[var(--text-tertiary)]">S/</span>
        <input
          type="number"
          aria-label="Precio"
          autoFocus
          min={0}
          step={0.5}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit();
            }
            if (e.key === "Escape") onCancel();
          }}
          onBlur={onCommit}
          disabled={busy}
          className="w-24 h-12 px-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] text-sm font-extrabold text-right tabular-nums outline-none"
        />
      </div>
    );
  }
  if (value <= 0 && !alwaysBold) {
    return (
      <span
        {...editable(onStartEdit)}
        title="Toca para agregar el precio mayorista"
        className="inline-flex min-h-12 cursor-pointer items-center whitespace-nowrap text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      >
        —
      </span>
    );
  }
  return (
    <span
      {...editable(onStartEdit)}
      title="Toca para editar el precio"
      className={cn(
        "inline-flex min-h-12 cursor-pointer items-center whitespace-nowrap tabular-nums transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]",
        alwaysBold
          ? "font-extrabold text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]",
      )}
    >
      {formatCurrency(value)}
    </span>
  );
}

