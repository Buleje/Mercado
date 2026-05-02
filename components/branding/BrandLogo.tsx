"use client";

/**
 * BrandLogo — wrapper que muestra el logo configurado en
 * /superadmin/configuracion, o el fallback (BulejeWordmark/BulejeMark)
 * si el superadmin todavía no subió ninguno.
 *
 * Se hidrata fetcheando /api/platform-config/public (cache 60s). En el
 * primer paint muestra el fallback para evitar layout shift.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import type { PlatformConfig } from "@/lib/platform-config";

interface Props {
  /** Componente fallback cuando no hay logoUrl configurado. */
  fallback: React.ReactNode;
  /** Variante: "wordmark" muestra el logo + texto del brand.name. */
  variant?: "mark" | "wordmark";
  /** Altura del logo en px. Width se calcula proporcional. */
  height?: number;
  className?: string;
}

let cachedCfg: PlatformConfig | null = null;
let inflight: Promise<PlatformConfig | null> | null = null;

function fetchCfg(): Promise<PlatformConfig | null> {
  if (cachedCfg) return Promise.resolve(cachedCfg);
  if (inflight) return inflight;
  inflight = fetch("/api/platform-config/public", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { config?: PlatformConfig } | null) => {
      cachedCfg = d?.config ?? null;
      inflight = null;
      return cachedCfg;
    })
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
}

export default function BrandLogo({ fallback, variant = "wordmark", height = 32, className }: Props) {
  const [cfg, setCfg] = useState<PlatformConfig | null>(cachedCfg);

  useEffect(() => {
    let cancelled = false;
    void fetchCfg().then((c) => {
      if (!cancelled) setCfg(c);
    });
    return () => { cancelled = true; };
  }, []);

  // Mientras carga, o si no hay logo custom, mostramos el fallback (Buleje).
  if (!cfg?.brand.logoUrl) {
    return <>{fallback}</>;
  }

  const brandName = cfg.brand.name || "Buleje";
  // Width estimado 4:1 si es wordmark, 1:1 si es mark — el cliente puede
  // afinar después con className. Image de next/image necesita width/height.
  const width = variant === "wordmark" ? height * 4 : height;

  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Image
        src={cfg.brand.logoUrl}
        alt={brandName}
        height={height}
        width={width}
        unoptimized
        style={{ height, width: "auto", maxWidth: width }}
      />
      {variant === "wordmark" && (
        <span style={{ fontWeight: 800, fontSize: height * 0.55, letterSpacing: "-0.02em" }}>
          {brandName}
        </span>
      )}
    </span>
  );
}
