"use client";

/**
 * Despacho › «Asignar a alguien sin registro»: el vecino o el sobrino que lleva
 * el pedido sin ser repartidor. Sólo se guarda el nombre (sin GPS). Salió de
 * `DespachoSection.tsx` (10-10, tope de 300 líneas por componente).
 */
import { Loader2, Sparkles, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";

interface Props {
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  valor: string;
  onValor: (v: string) => void;
  guardando: boolean;
  onGuardar: () => void;
}

export function DespachoAdHoc({
  abierto,
  onAbrir,
  onCerrar,
  valor,
  onValor,
  guardando,
  onGuardar,
}: Props) {
  return (
    <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/30">
      {!abierto ? (
        <button
          type="button"
          onClick={onAbrir}
          className="flex min-h-12 w-full items-center justify-center gap-2 px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Asignar a alguien sin registro
        </button>
      ) : (
        <div className="space-y-1 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)]">
            Quién lo lleva
            <InfoTip what="Sin GPS ni seguimiento: sólo se guarda el nombre, para que se vea en el pedido." />
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={valor}
              onChange={(e) => onValor(e.target.value)}
              placeholder="Ej: María (vecina), Juan (sobrino)…"
              className="flex-1 h-12 px-3.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
              onKeyDown={(e) => e.key === "Enter" && onGuardar()}
            />
            <button
              type="button"
              onClick={onGuardar}
              disabled={guardando || !valor.trim()}
              className={button({ variant: "primary", className: "rounded-xl px-4" })}
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="h-12 w-12 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              aria-label="Cancelar"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
