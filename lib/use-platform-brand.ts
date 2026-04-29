"use client";

/**
 * usePlatformBrand — hook para consumir la marca de la plataforma.
 *
 * Qué entrega:
 *  - identity, logos, colors, contact, socials, seo, legal
 *  - eventMode YA RESUELTO: si está activo + dentro de ventana, los overrides
 *    ya están aplicados sobre logos.logoLight/logoDark y colors.primary/accent
 *
 * Cache:
 *  - 1 fetch al mount, cacheable a nivel CDN (5 min)
 *  - Cualquier componente puede llamarlo sin worry de N requests
 *
 * Uso típico:
 *   const { brand, loading } = usePlatformBrand();
 *   <img src={brand?.logos.logoLight ?? "/logo-fallback.svg"} />
 *   <a href={`mailto:${brand?.contact.email}`} />
 */

import { useEffect, useState } from "react";

export type PublicPlatformBrand = {
  identity: { name: string; tagline: string; description: string; since: string; city: string; country: string };
  logos: { logoLight: string | null; logoDark: string | null; logoSquare: string | null; favicon: string | null; ogImage: string | null };
  colors: { primary: string; secondary: string; accent: string; danger: string; success: string };
  typography: { fontFamily: string; fontDisplay: string };
  contact: { email: string; phone: string; whatsapp: string; address: string; supportHours: string };
  socials: { instagram: string; facebook: string; tiktok: string; x: string; youtube: string };
  seo: { metaTitle: string; metaDescription: string; ogTitle: string; ogDescription: string };
  legal: { legalName: string; ruc: string; termsUrl: string; privacyUrl: string; cookiesUrl: string };
};

const BROADCAST_NAME = "buleje-platform-brand";

let _cache: PublicPlatformBrand | null = null;
let _inflight: Promise<PublicPlatformBrand | null> | null = null;

async function fetchBrand(force = false): Promise<PublicPlatformBrand | null> {
  if (_cache && !force) return _cache;
  if (_inflight) return _inflight;
  _inflight = fetch("/api/platform-brand", force ? { cache: "no-store" } : undefined)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: PublicPlatformBrand | null) => {
      _cache = d;
      return d;
    })
    .catch((err) => {
      console.warn("[usePlatformBrand]", err);
      return null;
    })
    .finally(() => { _inflight = null; });
  return _inflight;
}

/** Vacía el cache global. Usar tras guardar la marca desde superadmin. */
export function clearPlatformBrandCache() {
  _cache = null;
}

/**
 * Notifica a todas las tabs/pestañas que la marca cambió.
 * El hook escucha este broadcast y refetcha automáticamente.
 * Llamar después de guardar exitosamente en /superadmin/marca.
 */
export function broadcastPlatformBrandUpdate() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(BROADCAST_NAME);
    ch.postMessage({ type: "updated", at: Date.now() });
    ch.close();
  } catch {
    /* silent — fallback nada */
  }
}

export function usePlatformBrand() {
  const [brand, setBrand] = useState<PublicPlatformBrand | null>(_cache);
  const [loading, setLoading] = useState(_cache === null);

  useEffect(() => {
    let cancelled = false;
    fetchBrand().then((d) => {
      if (!cancelled) {
        setBrand(d);
        setLoading(false);
      }
    });

    // Listener: cuando otra tab guarda la marca, refetch en esta tab.
    let ch: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        ch = new BroadcastChannel(BROADCAST_NAME);
        ch.onmessage = () => {
          clearPlatformBrandCache();
          fetchBrand(true).then((d) => {
            if (!cancelled) setBrand(d);
          });
        };
      } catch { /* fallback nada */ }
    }

    return () => {
      cancelled = true;
      if (ch) ch.close();
    };
  }, []);

  return { brand, loading };
}
