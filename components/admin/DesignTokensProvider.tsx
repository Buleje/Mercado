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

  const styleObj = useMemo(() => tokensToCssVars(tokens) as React.CSSProperties, [tokens]);

  return (
    <div data-design-preset={tokens.meta.slug} style={styleObj}>
      {children}
    </div>
  );
}
