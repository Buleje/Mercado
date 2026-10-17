"use client";

import { X, Receipt, Percent, Volume2, VolumeX } from "@buleje/design-system/icons";
import { fmt } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/** Cabecera del cobro: total gigante, artículos, descuento y redondeo. */
export default function PagoCabecera({ p }: { p: PagoModal }) {
  const { cartCount, onCancel, voiceEnabled, setVoiceEnabled, setShowDiscount, setDiscountMode, setDiscountValue, discountAmount, total } = p;
  return (
        <div className="shrink-0 relative overflow-hidden border-b border-[var(--rule-base)] bg-linear-to-b from-[var(--surface-raised)] to-[var(--surface-sunken)] dark:from-[var(--surface-raised)] dark:to-[var(--surface-sunken)]">
          {/* Glow decorativo de fondo (sutil, primary del proyecto) */}
          <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(ellipse_at_top_left,rgba(0, 160, 160,0.10),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(20, 194, 194,0.10),transparent_60%)]" />

          <div className="relative px-5 sm:px-6 py-4 flex items-center gap-4">
            {/* Voice toggle (izquierda) */}
            <button
              onClick={() => { const next = !voiceEnabled; setVoiceEnabled(next); try { localStorage.setItem("pos-voice-total", String(next)); } catch {} }}
              className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--rule-soft)] hover:border-primary/40 shadow-sm transition-colors text-[var(--text-secondary)] hover:text-primary"
              title={voiceEnabled ? "Desactivar voz" : "Activar voz"}
              aria-label={voiceEnabled ? "Desactivar voz del total" : "Activar voz del total"}
            >
              {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {/* Centro: label + total + chip items */}
            <div className="flex-1 min-w-0 flex flex-col">
              <p className="text-[length:var(--ts-2xs)] font-extrabold text-primary uppercase tracking-[var(--tracking-eyebrow)] mb-0.5">
                Total a cobrar
              </p>
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-4xl lg:text-5xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
                  {fmt(total)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-bold border border-primary/20 shadow-sm">
                    <Receipt className="h-3.5 w-3.5" />
                    {cartCount} {cartCount === 1 ? "artículo" : "artículos"}
                  </span>
                  {discountAmount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-error-500)]/15 text-[var(--data-error-500)] text-xs font-extrabold shadow-sm">
                      <Percent className="h-3 w-3" />
                      −{fmt(discountAmount)} dto
                    </span>
                  )}
                </div>
                {/* Redondeo chips inline */}
                {total % 1 !== 0 && (() => {
                  const bajo = Math.floor(total);
                  const alto = Math.ceil(total);
                  const a5 = Math.ceil(total / 5) * 5;
                  const opciones = [
                    { val: bajo, diff: total - bajo },
                    { val: alto, diff: alto - total },
                    ...(total > 10 && a5 !== alto ? [{ val: a5, diff: a5 - total }] : []),
                  ].filter(o => Math.abs(o.diff) < 3 && o.val > 0);
                  const uniq = [...new Map(opciones.map(o => [o.val, o])).values()];
                  if (uniq.length === 0) return null;
                  return (
                    <div className="hidden lg:flex items-center gap-1">
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-bold uppercase tracking-wide">Redondear:</span>
                      {uniq.map(o => (
                        <button key={o.val} onClick={() => { setDiscountValue(String((total - o.val).toFixed(2))); setDiscountMode("fixed"); setShowDiscount(true); }}
                          className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-[var(--surface-raised)] border border-[var(--rule-soft)] hover:bg-primary hover:text-white hover:border-primary shadow-sm transition-colors">
                          S/{o.val}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Cerrar (derecha) */}
            <button
              onClick={onCancel}
              aria-label="Cerrar"
              className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--rule-soft)] hover:bg-[var(--data-error-500)] hover:text-white hover:border-[var(--data-error-500)] text-[var(--text-secondary)] shadow-sm transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
  );
}
