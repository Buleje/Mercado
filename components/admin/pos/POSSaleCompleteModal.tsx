"use client";

import { toast } from "sonner";
import { useMemo, useRef } from "react";
import { Banknote, X, Check, Receipt, Printer, Smartphone, CreditCard, HandCoins } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import { isThermalPrintSupported, printThermal } from "@/lib/thermal-printer";
import { fmt, type LastSaleDetails } from "@/components/admin/pos/pos-shared";
import { SaleConfetti, useCountUp } from "@/components/admin/pos/POSSaleConfetti";
import QuickAbonoFromSale from "@/components/admin/pos/POSQuickAbono";
import POSVentaWhatsApp from "@/components/admin/pos/POSVentaWhatsApp";
import ReciboVistaPrevia from "@/components/admin/pos/recibo/ReciboVistaPrevia";
import { useHoraDelCobro, useReciboVenta } from "@/components/admin/pos/recibo/use-recibo-venta";
import { entradaDesdeVenta } from "@/components/admin/pos/recibo/entrada-recibo";
import { useVendesComo } from "@/components/admin/pos/use-responsable-venta";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { datosTermicos, FORMATOS_RECIBO } from "@/lib/recibo/modelo-recibo";

// ── Sale Complete Modal (Mejora 4: WhatsApp mejorado + Mejora 1: animaciones) ──
// 17-10: el recibo se ve en el mismo modal (80 mm · 58 mm · A4) y se imprime
// directo en ese formato. Sus montos son los de la venta GUARDADA, no el carrito
// (que ya está vacío cuando se abre: el ESC/POS salía sin ítems y en S/ 0).

const METODO_ICONO: Record<string, typeof Banknote> = {
  efectivo: Banknote,
  yape: Smartphone,
  plin: Smartphone,
  tarjeta: CreditCard,
  mixto: HandCoins,
  fiado: HandCoins,
};

export default function SaleCompleteModal({
  saleComplete,
  lastSaleDetails,
  cartTotal,
  paymentMethod,
  onNewSale,
  onClose,
}: {
  saleComplete: { id: string; change: number };
  lastSaleDetails: LastSaleDetails | null;
  cartTotal: number;
  paymentMethod: string;
  onNewSale: () => void;
  onClose: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  useModalAccesible(caja, { onCerrar: onClose });
  const atendio = useVendesComo();
  const hora = useHoraDelCobro();
  const entrada = useMemo(
    () =>
      entradaDesdeVenta({
        ventaId: saleComplete.id,
        detalles: lastSaleDetails,
        atendio,
        respaldo: { total: cartTotal, metodo: paymentMethod, vuelto: saleComplete.change >= 0 ? saleComplete.change : null, fecha: hora },
      }),
    [saleComplete.id, saleComplete.change, lastSaleDetails, atendio, cartTotal, paymentMethod, hora],
  );
  const recibo = useReciboVenta(entrada);
  const { modelo } = recibo;
  const displayTotal = modelo.totales.total;
  // Fix 2026-07-08 (reporte ventas-caja): el count-up 0→total tardaba 1000ms →
  // un vistazo/captura al abrir el modal "¡Venta completada!" podía leer un
  // monto intermedio (ej. S/4.84 en una venta de S/50). Lo acortamos a 550ms:
  // sigue siendo un "pop" celebratorio pero se estabiliza casi al instante.
  const animatedTotal = useCountUp(displayTotal, 550);

  // Payment method → icono Lucide (no emojis). Consistente con el design system.
  const method = (lastSaleDetails?.venta?.payment || lastSaleDetails?.payment || paymentMethod || "efectivo").toLowerCase();
  const PayIcon = METODO_ICONO[method] ?? Banknote;
  const formatoCorto = FORMATOS_RECIBO.find((f) => f.id === recibo.formato)?.corto ?? "";

  const imprimirTermico = async () => {
    try {
      await printThermal(datosTermicos(modelo, saleComplete.id, new Date(lastSaleDetails?.venta?.createdAt ?? hora)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al imprimir");
    }
  };

  return (
    <div className="modal-backdrop p-4">
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby="venta-completada-titulo"
        className="relative bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-w-md lg:max-w-[60rem] w-full max-h-[92vh] flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]"
      >
        {/* Boton cerrar (X): del modal entero, también cierra con Escape */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-30 p-2 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <X className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
        </button>

        {/* Columna izquierda: lo de siempre. En el celular sus hijos son del modal (contents) para que el recibo quede antes del pie. */}
        <div className="contents lg:flex lg:flex-col lg:w-[26rem] lg:shrink-0 lg:min-h-0 lg:border-r lg:border-[var(--rule-soft)]">
        {/* Header — success + titulo + total */}
        <div className="px-6 pt-8 pb-6 text-center relative overflow-hidden shrink-0">
          <SaleConfetti />

          <m.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="h-20 w-20 rounded-full bg-primary/10 dark:bg-primary/15 flex items-center justify-center mx-auto mb-4 relative z-20"
          >
            <Check className="h-10 w-10 text-[var(--data-success-500)]" strokeWidth={3} />
          </m.div>
          <m.h3
            id="venta-completada-titulo"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4"
          >
            ¡Venta completada!
          </m.h3>
          <m.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-4xl sm:text-5xl font-extrabold text-primary tabular-nums"
          >
            {fmt(animatedTotal)}
          </m.p>
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
            <PayIcon className="h-4 w-4 text-[var(--text-secondary)]" />
            <span className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">
              Pagado con <span className="capitalize">{method}</span>
            </span>
          </div>
        </div>

        {/* Body (en pantalla ancha, sólo esta parte scrollea) */}
        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto px-6 pb-5 space-y-4">
          {saleComplete.change === -1 ? (
            <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)]/30 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-[var(--data-warning-ink)] uppercase tracking-wide mb-1">Venta al fiado</p>
              <p className="text-base text-[var(--data-warning-ink)]">El cliente queda debiendo</p>
            </div>
          ) : saleComplete.change > 0 ? (
            <div className="bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 rounded-xl p-5 text-center">
              <p className="text-sm font-semibold text-[var(--data-success-500)] uppercase tracking-wide mb-1">Dar de vuelto</p>
              <p className="text-4xl font-extrabold text-[var(--data-success-500)] tabular-nums">{fmt(saleComplete.change)}</p>
            </div>
          ) : null}

          {modelo.tipo !== "ticket" ? (
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                  {modelo.pendienteDeEmision ? "Comprobante · pendiente de emisión" : "Comprobante"}
                </p>
                <p className="text-base font-mono font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  {modelo.nombreCorto} {modelo.numero}
                </p>
              </div>
            </div>
          ) : null}

          <QuickAbonoFromSale customerPhone={lastSaleDetails?.customerPhone} customerName={lastSaleDetails?.customerName} />

          <POSVentaWhatsApp
            modelo={modelo}
            firma={modelo.negocio}
            telefono={lastSaleDetails?.customerPhone}
            nombre={lastSaleDetails?.customerName}
          />
        </div>

        {/* Footer — acciones principales (en el celular queda pegado abajo, después del recibo) */}
        <div className="order-2 lg:order-none sticky bottom-0 lg:static z-20 shrink-0 px-6 py-5 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={recibo.imprimir}
              disabled={recibo.cargando}
              aria-label={`Imprimir el recibo en ${formatoCorto}`}
              className="min-h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] font-semibold text-base hover:bg-[var(--surface-sunken)] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="h-5 w-5" />
              Imprimir <span className="text-sm font-medium text-[var(--text-secondary)]">{formatoCorto}</span>
            </button>
            <button
              type="button"
              onClick={onNewSale}
              className="min-h-12 rounded-xl bg-primary text-white font-semibold text-base hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
            >
              Nueva venta
              <span aria-hidden>&rarr;</span>
            </button>
          </div>
          {isThermalPrintSupported() && (
            <button
              type="button"
              onClick={imprimirTermico}
              className="w-full py-2.5 rounded-xl text-[var(--text-secondary)] dark:text-muted font-semibold text-sm hover:bg-[var(--surface-raised)] transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="h-4 w-4" /> Ticket térmico (ESC/POS)
            </button>
          )}
        </div>
        </div>

        {/* Columna derecha (debajo y plegada en el celular): el recibo tal como sale */}
        <ReciboVistaPrevia
          recibo={recibo}
          className="order-1 lg:order-none px-6 pb-4 lg:p-6 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:bg-[var(--surface-sunken)]"
        />
      </div>
    </div>
  );
}
