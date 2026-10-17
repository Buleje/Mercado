"use client";

/**
 * FreeShipPromoBar — barra "Te faltan S/ X para envío gratis" para la LANDING
 * /t/[slug] (Brandon 2026-06-26, Modo Creativo > Automatización). Sube el ticket
 * promedio. La landing NO monta CartProvider (el carrito vive en el catálogo),
 * así que lee el total del carrito desde localStorage (`buleje-{slug}-cart`) y
 * se refresca por evento `storage` + foco. Para el catálogo `(store)` ya existe
 * FreeShippingBar (cart-context). Copy en tuteo peruano.
 */
import { useEffect, useState } from "react";
import { Truck, Check } from "@buleje/design-system/icons";

function readCartTotal(slug: string): number {
  try {
    const raw = localStorage.getItem(`buleje-${slug}-cart`);
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) return 0;
    return items.reduce((acc: number, i: { price?: unknown; quantity?: unknown }) => acc + (Number(i?.price) || 0) * (Number(i?.quantity) || 0), 0);
  } catch {
    return 0;
  }
}

export default function FreeShipPromoBar({
  slug,
  threshold,
  text,
}: {
  slug: string;
  threshold: number;
  text?: string;
}) {
  const [total, setTotal] = useState<number>(0);

  useEffect(() => {
    const read = () => setTotal(readCartTotal(slug));
    read();
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, [slug]);

  if (!Number.isFinite(threshold) || threshold <= 0) return null;

  const falta = Math.max(0, threshold - total);
  const pct = Math.min(100, Math.round((total / threshold) * 100));
  const done = falta <= 0 && total > 0;
  const faltaStr = `S/ ${falta.toFixed(2)}`;
  const msg = done
    ? "¡Ya tienes envío gratis!"
    : total === 0
      ? `Envío gratis en pedidos desde S/ ${threshold.toFixed(2)}`
      : text && text.trim()
        ? text.replace("{falta}", faltaStr)
        : `Te faltan ${faltaStr} para el envío gratis`;

  return (
    <div data-pb="free-ship" className="w-full text-white" style={{ background: "var(--tenant-primary, var(--accent))" }} role="status" aria-live="polite">
      <div className="mx-auto max-w-5xl px-4 py-2">
        <p className="flex items-center justify-center gap-2 text-center text-sm font-bold">
          {done ? <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden /> : <Truck className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />}
          {msg}
        </p>
        {total > 0 && !done && (
          <div className="mx-auto mt-1.5 h-1.5 max-w-md overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
