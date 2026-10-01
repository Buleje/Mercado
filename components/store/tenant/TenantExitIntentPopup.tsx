"use client";

/**
 * TenantExitIntentPopup — popup que aparece cuando el visitante mueve el cursor
 * hacia arriba para cerrar/cambiar de pestaña (Brandon 2026-06-27, Lote C).
 * Ofrece un cupón de último momento → sube conversión ~3-5%. Una vez por sesión
 * (sessionStorage). En ?preview=true se muestra al primer mousemove para que el
 * dueño lo vea editando. No bloqueante: X, click fuera, Escape.
 */
import { useEffect, useState } from "react";
import { X } from "@buleje/design-system/icons";

export default function TenantExitIntentPopup({
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
    const isPreview =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "true";
    let shown = false;
    try {
      shown = sessionStorage.getItem(storageKey) === "1";
    } catch {
      /* private browsing */
    }
    if (shown && !isPreview) return;

    const trigger = () => {
      if (shown) return;
      shown = true;
      setOpen(true);
      try { sessionStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    };

    // Salida real: el cursor cruza el borde superior de la ventana.
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) trigger();
    };
    // En preview, mostrar tras el primer movimiento para que el dueño lo vea.
    const onPreviewMove = () => trigger();

    if (isPreview) {
      const t = setTimeout(() => document.addEventListener("mousemove", onPreviewMove, { once: true }), 800);
      return () => { clearTimeout(t); document.removeEventListener("mousemove", onPreviewMove); };
    }
    document.addEventListener("mouseout", onLeave);
    return () => document.removeEventListener("mouseout", onLeave);
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const brand = "var(--tenant-primary, var(--accent))";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-label={title} className="tenant-theme relative w-full max-w-sm rounded-2xl bg-[var(--surface-raised)] p-6 shadow-2xl">
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="absolute right-3 top-3 rounded-full p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)]">
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </button>
        <p data-live="exitIntentTitle" className="text-xl font-black" style={{ color: brand }}>
          {title || "¡Esperá!"}
        </p>
        {message && (
          <p data-live="exitIntentMessage" className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>
        )}
        {coupon && (
          <span className="mt-3 inline-block rounded-md border-2 border-dashed px-3 py-1 font-mono text-sm font-bold" style={{ borderColor: brand, color: brand }}>
            {coupon}
          </span>
        )}
        <a href={ctaHref} onClick={() => setOpen(false)} className="mt-4 block w-full rounded-lg py-2.5 text-center text-sm font-bold text-white" style={{ backgroundColor: brand }}>
          Aprovechar ahora
        </a>
      </div>
    </div>
  );
}
