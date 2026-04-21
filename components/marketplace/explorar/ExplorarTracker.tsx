"use client";

/**
 * ExplorarTracker — emit analytics event `view_item_list` al montar.
 *
 * Compatible con GA4, Plausible, y window.dataLayer custom.
 * Si no hay analytics configurado, hace no-op silencioso.
 *
 * Tambien emite `scroll_depth` en hitos 25/50/75/100 % para medir
 * engagement con la pagina.
 */

import { useEffect } from "react";

interface Props {
  pageName: string;
}

// Tipos minimos sin colisionar con declaraciones globales del proyecto
type DataLayer = { push: (entry: Record<string, unknown>) => void };
type Gtag = (command: string, eventName: string, params?: Record<string, unknown>) => void;
type Plausible = (event: string, options?: { props?: Record<string, unknown> }) => void;

function emit(event: string, props: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as {
      dataLayer?: DataLayer;
      gtag?: Gtag;
      plausible?: Plausible;
    };
    w.dataLayer?.push({ event, ...props });
    w.gtag?.("event", event, props);
    w.plausible?.(event, { props });
  } catch {
    // analytics no debe romper la pagina
  }
}

export default function ExplorarTracker({ pageName }: Props) {
  useEffect(() => {
    emit("view_item_list", { item_list_name: pageName, page: pageName });

    const milestones = new Set<number>();
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = Math.round((window.scrollY / max) * 100);
      for (const m of [25, 50, 75, 100]) {
        if (pct >= m && !milestones.has(m)) {
          milestones.add(m);
          emit("scroll_depth", { depth: m, page: pageName });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pageName]);

  return null;
}
