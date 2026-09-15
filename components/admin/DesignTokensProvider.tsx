"use client";

/**
 * DesignTokensProvider — inyecta los CSS variables del preset activo
 * (resolución: tenant-custom > tenant-preset > global) al shell del admin.
 *
 * Uso:
 *   <DesignTokensProvider tenantId={tenantSlug}>
 *     <AdminShell>...</AdminShell>
 *   </DesignTokensProvider>
 *
 * Comportamiento:
 *   - SSR-safe: si no hay `initialTokens`, usa el preset DEFAULT y luego
 *     hace fetch al endpoint para reemplazar.
 *   - El primer paint NO parpadea — los tokens default ya cubren `:root`
 *     (vienen de globals.css). Lo que añadimos es scoped al wrapper.
 *   - Refetch on focus para que los cambios del superadmin se vean en
 *     <60s sin reload.
 */

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PRESET_SLUG, DESIGN_PRESETS, tokensToCssVars, type DesignTokens } from "@/lib/design-presets";
import { useTheme } from "@/contexts/theme-context";

/**
 * Variables que describen el CLARO/OSCURO de la interfaz (fondos, texto,
 * líneas), a diferencia de las que describen la MARCA (accent, tipografía,
 * radios, colores semánticos).
 *
 * En modo oscuro estas NO se inyectan si el preset es claro: al ir inline en
 * un `<div>`, ganarían siempre contra `:root.dark` de globals.css y dejarían
 * el panel con fondos blancos y texto claro sobre claro. Se descubrió con el
 * editor de planillas, que quedaba blanco entero con dark activo.
 */
const VARS_DE_SUPERFICIE = [
  "--surface-canvas", "--surface-raised", "--surface-sunken",
  "--text-primary", "--text-secondary", "--text-tertiary",
  "--rule-soft", "--rule-base", "--rule-strong",
] as const;

/**
 * Los colores semánticos tienen el MISMO problema que las superficies, y se
 * había resuelto sólo para ellas.
 *
 * `success`, `warning`, `error` e `info` del preset se eligen mirando la
 * interfaz clara, y `tokensToCssVars` los inyecta tal cual —inline, o sea
 * ganándole a `:root.dark`— también en modo oscuro. El resultado se puede
 * medir: el badge «Pagado» del Historial de Gastos daba **4.28:1** en dark con
 * un verde `#00ac4e` que no está en `globals.css` en ninguna parte; venía del
 * preset del tenant. `globals.css` sí trae la versión calibrada para oscuro
 * (`#14C2C2` para success), y quedaba pisada.
 *
 * Se aplica el mismo criterio ya aceptado para las superficies: si el preset
 * es claro y el usuario está en oscuro, estos tokens NO se inyectan y mandan
 * los de `globals.css`. Se pierde el matiz de marca en los semánticos dentro
 * del modo oscuro; se gana que el texto se lea. La identidad la sigue llevando
 * el `--accent`, que no se toca.
 */
const PREFIJOS_SEMANTICOS = ["--data-success", "--data-warning", "--data-error", "--data-info"] as const;

/**
 * ¿El preset ya es oscuro? Si el superadmin eligió un preset dark, sus
 * superficies mandan y no hay nada que corregir.
 *
 * Los presets escriben el color como `oklch(L C H)`, donde L va de 0 a 1.
 */
function presetEsOscuro(surface: string): boolean {
  const l = /oklch\(\s*([\d.]+)/.exec(surface);
  return l ? Number(l[1]) < 0.5 : false;
}

interface DesignTokensProviderProps {
  tenantId?: string | null;
  /** Si la página ya hidrató los tokens en SSR, los pasa para evitar flash. */
  initialTokens?: DesignTokens | null;
  children: React.ReactNode;
}

export default function DesignTokensProvider({
  tenantId,
  initialTokens,
  children,
}: DesignTokensProviderProps) {
  const [tokens, setTokens] = useState<DesignTokens>(
    initialTokens ?? DESIGN_PRESETS.find((p) => p.meta.slug === DEFAULT_PRESET_SLUG) ?? DESIGN_PRESETS[0],
  );

  useEffect(() => {
    let cancelled = false;
    const url = tenantId
      ? `/api/design-system/active?tenantId=${encodeURIComponent(tenantId)}`
      : `/api/design-system/active`;

    const load = async () => {
      try {
        // cache: no-store para que el cambio del superadmin se vea sin esperar el TTL.
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.tokens) setTokens(json.tokens as DesignTokens);
      } catch {
        // mantener default
      }
    };
    load();

    // Refetch al volver al tab — captura cambios del superadmin sin reload
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [tenantId]);

  const { resolved } = useTheme();

  const styleObj = useMemo(() => {
    const vars = tokensToCssVars(tokens);
    if (resolved === "dark" && !presetEsOscuro(tokens.colors.surface)) {
      for (const v of VARS_DE_SUPERFICIE) delete vars[v];
      for (const k of Object.keys(vars)) {
        if (PREFIJOS_SEMANTICOS.some((p) => k.startsWith(p))) delete vars[k];
      }
    }
    return vars as React.CSSProperties;
  }, [tokens, resolved]);

  return (
    <div data-design-preset={tokens.meta.slug} style={styleObj}>
      {children}
    </div>
  );
}
