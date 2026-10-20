"use client";

import { Receipt, Loader2, HandCoins } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { isValidRuc } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/** Por qué «Cobrar» está apagado, en una línea (las mismas condiciones de `canConfirm`). */
function motivoBloqueo(p: PagoModal): { texto: string; tono: "error" | "aviso" } | null {
  if (p.processing) return null;
  if (p.isFiado && !p.customerPhone) return { texto: "Selecciona un cliente para continuar", tono: "error" };
  if (p.comprobanteTipo === "factura" && !isValidRuc(p.comprobanteRuc)) return { texto: "Escribe el RUC (11 dígitos) de la factura.", tono: "aviso" };
  if (p.faltaDni) return { texto: "Escribe el DNI del cliente para confirmar esta boleta.", tono: "aviso" };
  return null;
}

/**
 * Pie del cobro, FUERA del scroll (prop `footer` de AdminModal): en celular el
 * botón queda siempre abajo. «Cobrar · Enter» sin el total: el total está una
 * sola vez, grande, en la misma columna justo arriba (y pegado arriba en
 * celular); repetirlo en el botón era la tercera copia de la misma cifra.
 */
export default function PagoPie({ p }: { p: PagoModal }) {
  const { processing, handleConfirm, isFiado, canConfirm, esperandoPrecio, showCustomerList } = p;
  const motivo = motivoBloqueo(p);
  return (
    <div
      // Con la lista de clientes encima no se cobra: antes la lista tapaba el pie.
      inert={showCustomerList || undefined}
      className={cn(
        "grid gap-2 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-center md:gap-6",
        showCustomerList && "opacity-40",
      )}
    >
      <p
        role="status"
        className={cn(
          "min-w-0 text-sm font-semibold empty:hidden md:empty:block",
          motivo?.tono === "error" ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]",
        )}
      >
        {motivo?.texto}
      </p>
      <button
        type="button"
        onClick={handleConfirm}
        // Esperando el precio de la clienta queda prendido: el clic cobra apenas llega (usePagoModal).
        disabled={!canConfirm && !esperandoPrecio}
        aria-busy={esperandoPrecio || undefined}
        data-pago-cobrar=""
        className={cn(
          "flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-lg font-bold text-white shadow-[var(--shadow-md)] transition disabled:cursor-not-allowed disabled:opacity-40",
          "outline-none focus-visible:ring-4 focus-visible:ring-primary/40",
          /* Fondos oscuros en los dos temas: el teal y el coral claros con letra blanca no llegaban a 3:1. */
          isFiado
            ? "bg-[var(--data-warning-ink)] hover:brightness-110 dark:bg-[var(--data-warning-500)] dark:text-[var(--surface-canvas)]"
            : "bg-[var(--accent-dark)] hover:brightness-110",
        )}
      >
        {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : isFiado ? <HandCoins className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
        <span>{processing ? "Procesando…" : isFiado ? "Registrar fiado" : "Cobrar"}</span>
        {!processing && (
          <kbd className="ml-1 hidden rounded-md border border-current/40 px-1.5 py-0.5 font-sans text-xs font-semibold opacity-90 sm:inline">
            Enter
          </kbd>
        )}
      </button>
    </div>
  );
}
