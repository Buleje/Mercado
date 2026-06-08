"use client";

import { useEffect } from "react";

/**
 * PreviewLiveTheme — puente de vista previa EN VIVO (Brandon 2026-06-08).
 *
 * Se monta SOLO en la landing en modo `?preview=true` (dentro del iframe del
 * editor Modo Creativo / StoreCustomizer). Escucha `postMessage` del editor
 * (mismo origen) y aplica los design tokens al instante — sin recargar el
 * iframe — seteando CSS vars (`--tenant-primary`, `--tenant-accent`,
 * `--tenant-radius`, …) sobre el contenedor `.tenant-theme`.
 *
 * El editor manda `{ source: "buleje-editor", type: "live-theme", vars }`.
 * Cuando el preview termina de montar avisa `{ source: "buleje-preview",
 * type: "ready" }` para que el editor reenvíe el último estado.
 *
 * Las inline-styles del storefront usan `var(--tenant-*, <fallback server>)`,
 * así que sobrescribir la var aquí actualiza todo en caliente.
 */
export default function PreviewLiveTheme() {
  useEffect(() => {
    const applyVars = (vars: Record<string, unknown> | undefined) => {
      if (!vars) return;
      const target =
        (document.querySelector(".tenant-theme") as HTMLElement | null) ??
        document.documentElement;
      for (const [k, v] of Object.entries(vars)) {
        if (typeof v === "string" && k.startsWith("--")) {
          target.style.setProperty(k, v);
        }
      }
    };

    const onMessage = (e: MessageEvent) => {
      // Solo same-origin: el editor vive en el mismo dominio que el preview.
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; type?: string; vars?: Record<string, unknown> } | null;
      if (!data || data.source !== "buleje-editor" || data.type !== "live-theme") return;
      applyVars(data.vars);
    };

    window.addEventListener("message", onMessage);

    // Avisar al editor (parent) que el preview está listo → reenvía el theme.
    try {
      window.parent?.postMessage(
        { source: "buleje-preview", type: "ready" },
        window.location.origin,
      );
    } catch {
      /* sin parent (abierto directo) — no-op */
    }

    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}
