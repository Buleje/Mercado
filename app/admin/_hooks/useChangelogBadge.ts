"use client";

/**
 * app/admin/_hooks/useChangelogBadge.ts
 *
 * Hook que indica si el usuario debe ver el badge de "novedades" en el
 * changelog. Compara la versión actual con `localStorage["changelog-last-seen"]`.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect, useState } from "react";

const CURRENT_VERSION = "2.5";

export function useChangelogBadge(): boolean {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    try {
      const lastSeen = localStorage.getItem("changelog-last-seen");
      if (lastSeen !== CURRENT_VERSION) setHasNew(true);
    } catch {
      // localStorage bloqueado — asumir sin novedades
    }
  }, []);

  return hasNew;
}
