"use client";

import { useEffect, useState } from "react";
import { X } from "@buleje/design-system/icons";

/**
 * TenantWelcomePopup — popup de bienvenida configurable del storefront del tenant
 * (Brandon 2026-06-25). Se monta en /t/<slug> cuando el dueño lo activa desde
 * Modo Creativo > Automatización. Muestra título + mensaje + cupón opcional.
 *
 * No es bloqueante: se cierra con la X, click fuera o Escape (regla de Brandon
 * "no modales bloqueantes de entrada"). Se muestra UNA vez por navegador
 * (localStorage); en `?preview=true` (editor) se muestra siempre para que el
 * dueño lo vea mientras edita. El color sale de --tenant-primary (live) con
 * fallback al acento del DS.
 */
export default function TenantWelcomePopup({
  title,
  message,
  coupon,
  ctaHref,
  storageKey,
}: {
  title: string;
  message: string;
  coupon?: string;
  ctaHref: string;
  storageKey: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(storageKey) === "1";
    } catch {
      /* private browsing */
    }
    const isPreview =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "true";
    if (dismissed && !isPreview) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;
  const brand = "var(--tenant-primary, var(--accent))";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={close}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="tenant-theme relative w-full max-w-sm rounded-2xl bg-[var(--surface-raised)] p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-full p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </button>
        <p data-live="welcomePopupTitle" className="text-xl font-black" style={{ color: brand }}>
          {title || "¡Bienvenido!"}
        </p>
        {message && (
          <p data-live="welcomePopupMessage" className="mt-2 text-sm text-[var(--text-secondary)]">
            {message}
          </p>
        )}
        {coupon && (
          <span
            className="mt-3 inline-block rounded-md border-2 border-dashed px-3 py-1 font-mono text-sm font-bold"
            style={{ borderColor: brand, color: brand }}
          >
            {coupon}
          </span>
        )}
        <a
          href={ctaHref}
          onClick={close}
          className="mt-4 block w-full rounded-lg py-2.5 text-center text-sm font-bold text-white"
          style={{ backgroundColor: brand }}
        >
          Empezar a comprar
        </a>
      </div>
    </div>
  );
}
