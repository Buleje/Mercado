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

    // Carga la Google Font elegida en el editor (live) inyectando/actualizando
    // un <link>. `null` = fuente de sistema → no carga nada.
    const loadFont = (label: string | null | undefined) => {
      if (!label) return;
      const family = encodeURIComponent(label).replace(/%20/g, "+");
      const href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;600;700;800;900&display=swap`;
      let link = document.getElementById("buleje-live-font") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.id = "buleje-live-font";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      if (link.href !== href) link.href = href;
    };

    // Modo oscuro EN VIVO (Brandon 2026-06-25): toggle de la clase `dark` —
    // antes solo se reflejaba tras recargar el iframe.
    const applyDarkMode = (dark: boolean | undefined) => {
      if (typeof dark !== "boolean") return;
      document.documentElement.classList.toggle("dark", dark);
      const tenant = document.querySelector(".tenant-theme") as HTMLElement | null;
      tenant?.classList.toggle("dark", dark);
    };

    // Texto EN VIVO (Brandon 2026-06-25): el editor manda {heroTitle, heroSubtitle,…}
    // y acá seteamos el textContent de los elementos marcados con data-live="<campo>".
    // Así editar el hero/nombre se ve al instante, sin esperar el reload de 2s.
    const applyText = (text: Record<string, unknown> | undefined) => {
      if (!text) return;
      for (const [key, val] of Object.entries(text)) {
        if (typeof val !== "string") continue;
        document.querySelectorAll(`[data-live="${key}"]`).forEach((el) => {
          if (el.textContent !== val) el.textContent = val;
        });
      }
    };

    const onMessage = (e: MessageEvent) => {
      // Solo same-origin: el editor vive en el mismo dominio que el preview.
      if (e.origin !== window.location.origin) return;
      const data = e.data as {
        source?: string;
        type?: string;
        vars?: Record<string, unknown>;
        fontLabel?: string | null;
        darkMode?: boolean;
        text?: Record<string, unknown>;
      } | null;
      if (!data || data.source !== "buleje-editor" || data.type !== "live-theme") return;
      applyVars(data.vars);
      loadFont(data.fontLabel);
      applyDarkMode(data.darkMode);
      applyText(data.text);
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
