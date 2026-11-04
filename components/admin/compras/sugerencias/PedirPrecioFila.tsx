"use client";

import { Check, MessageCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";

/**
 * Un proveedor en la ventana «Pedir precio»: casilla (se marca tocando la fila),
 * su nombre y teléfono, y —ya marcado— el botón que abre su WhatsApp con el
 * mensaje armado. Sin teléfono usable la fila queda apagada y no se marca.
 */
export default function PedirPrecioFila({
  nombre, telefono, sugerido, marcado, abierto, enlace, onAlternar, onAbierto,
}: {
  nombre: string;
  /** Teléfono ya legible («987 654 321»); `null` = sin teléfono. */
  telefono: string | null;
  /** Es el proveedor sugerido de alguno de los productos marcados. */
  sugerido: boolean;
  marcado: boolean;
  /** Ya se abrió su WhatsApp en esta ventana. */
  abierto: boolean;
  enlace: string | null;
  onAlternar: () => void;
  onAbierto: () => void;
}) {
  const puedeMarcar = telefono != null;
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-1 transition-colors",
        marcado ? "border-primary bg-primary/5 dark:bg-primary/10" : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={marcado}
        disabled={!puedeMarcar}
        onClick={onAlternar}
        className="flex min-h-12 min-w-0 flex-1 basis-44 items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-xs border-2 transition-colors",
            marcado ? "border-primary bg-primary" : "border-[var(--text-tertiary)]",
            !puedeMarcar && "opacity-50",
          )}
        >
          {marcado && <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-semibold", puedeMarcar ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
            {nombre}
          </span>
          <span className="block truncate text-sm text-[var(--text-secondary)]">
            {telefono ?? "Sin teléfono"}
            {sugerido && puedeMarcar ? " · su proveedor" : ""}
            {abierto ? " · abierto" : ""}
          </span>
        </span>
      </button>
      {marcado && enlace && (
        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onAbierto}
          className={button({ variant: "primary", className: "w-full shrink-0 gap-2 rounded-xl px-4 sm:w-auto" })}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Abrir WhatsApp
        </a>
      )}
    </li>
  );
}
