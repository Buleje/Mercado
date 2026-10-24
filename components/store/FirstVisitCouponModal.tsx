"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Gift,
  Sparkles,
  X,
} from "@buleje/design-system/icons";
import Link from "next/link";
import { useSettings } from "@/contexts/settings-context";

const STORAGE_KEY = "first-visit-coupon-shown";
const COUPON_CODE = "BIENVENIDO";
const DELAY_MS = 5000;
const PANEL_ID = "cupon-bienvenida-panel";

/**
 * FirstVisitCouponModal — bienvenida con cupón al primer visit del cliente.
 *
 * Rediseñado 2026-10-02 (Brandon: «tapa media pantalla en el celular»): entra
 * como UNA franja de una línea («10 % en tu primer pedido · Ver») y sólo se
 * abre al panel completo si la persona la toca. Misma franja en celular y en
 * escritorio (en la ficha el panel de 240 px tapaba «Agregar al carrito»).
 * Escape: panel abierto → vuelve a la franja; franja → se cierra y no vuelve.
 */
export default function FirstVisitCouponModal() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { storeTheme, businessName } = useSettings();
  const stripBtnRef = useRef<HTMLButtonElement>(null);
  const collapseBtnRef = useRef<HTMLButtonElement>(null);
  const moverFoco = useRef(false);

  const storeName =
    storeTheme?.name?.trim() ||
    (storeTheme as { storeName?: string } | null)?.storeName?.trim() ||
    businessName?.trim() ||
    "Buleje";

  const handleClose = useCallback(() => {
    setShow(false);
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* silent */
    }
  }, []);

  const cambiar = useCallback((abrir: boolean) => {
    moverFoco.current = true;
    setOpen(abrir);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(COUPON_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* silent */
    }
  }, []);

  // Defer mount until first visit + DELAY_MS
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") return;
    } catch {
      return;
    }
    const timer = setTimeout(() => setShow(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Escape: del panel a la franja; de la franja, cierra
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (open) cambiar(false);
      else handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show, open, handleClose, cambiar]);

  // El foco acompaña al cambio franja <-> panel (sólo si lo pidió la persona)
  useEffect(() => {
    if (!moverFoco.current) return;
    moverFoco.current = false;
    (open ? collapseBtnRef : stripBtnRef).current?.focus();
  }, [open]);

  if (!show) return null;

  return (
    // Brandon 2026-07-06 — NO bloqueante. Mobile: sobre el BottomNav.
    <aside
      role="region"
      aria-label="Cupón de bienvenida"
      className="fixed z-[7000] inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[20rem] motion-safe:animate-[slideUp_0.4s_cubic-bezier(0.34,1.3,0.64,1)]"
    >
      {open ? (
        <div
          id={PANEL_ID}
          className="relative overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-[var(--accent)]/12 to-transparent pointer-events-none"
          />

          {/* Achicar a la franja + cerrar del todo — áreas de toque ≥36px */}
          <div className="absolute top-2 right-2 z-20 flex items-center">
            <button
              ref={collapseBtnRef}
              type="button"
              onClick={() => cambiar(false)}
              aria-label="Achicar el cupón"
              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
            >
              <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Cerrar cupón de bienvenida"
              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          <div className="relative p-4">
            <div className="flex items-center gap-3 pr-16">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
                <Gift className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
                  <Sparkles className="h-3 w-3" strokeWidth={2.25} />
                  Cupón de bienvenida
                </p>
                <p className="mt-0.5 text-xl font-extrabold leading-none tracking-tight text-[var(--text-primary)]">
                  10<span className="text-[var(--accent)]">%</span> OFF{" "}
                  <span className="text-sm font-semibold text-[var(--text-secondary)]">
                    en tu 1er pedido
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? "Código copiado" : "Copiar código BIENVENIDO"}
              className="group mt-3 flex w-full items-center justify-between gap-3 rounded-xl border-2 border-dashed border-[var(--accent)]/35 bg-[var(--surface-sunken)] px-3 py-2 text-left transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 active:scale-[0.985]"
            >
              <span className="font-mono text-base font-extrabold tracking-[var(--ls-wider)] text-[var(--text-primary)] select-all truncate">
                {COUPON_CODE}
              </span>
              <span
                className={[
                  "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-extrabold uppercase tracking-wide transition-colors shrink-0",
                  copied
                    ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]"
                    : "bg-[var(--accent)]/12 text-[var(--accent)] group-hover:bg-[var(--accent)]/18",
                ].join(" ")}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                    Copiar
                  </>
                )}
              </span>
            </button>

            <Link
              href="/tiendas"
              onClick={handleClose}
              className="mt-2.5 inline-flex w-full h-11 items-center justify-center rounded-xl bg-[var(--text-primary)] text-[var(--surface-raised)] text-sm font-extrabold uppercase tracking-wide hover:opacity-90 transition-opacity active:scale-[0.985]"
            >
              Ir a comprar
            </Link>
            <p className="mt-2 text-center text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)]">
              Primer pedido en{" "}
              <span className="font-semibold text-[var(--text-secondary)]">{storeName}</span> · Sin monto mínimo
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]">
          <button
            ref={stripBtnRef}
            type="button"
            onClick={() => cambiar(true)}
            aria-expanded={false}
            aria-controls={PANEL_ID}
            className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full pl-2 pr-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
              <Gift className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
              10 % en tu primer pedido
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-extrabold text-[var(--text-primary)]">
              Ver
              <ChevronUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar cupón de bienvenida"
            className="mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </aside>
  );
}
