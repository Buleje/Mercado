"use client";

import { useEffect } from "react";

/**
 * TenantStoreChrome — marca el documento como "tienda individual" para que
 * globals.css aplique los bordes rectos SOLO en la tienda del comerciante
 * (no en el marketplace). Brandon 2026-06-21.
 *
 * Se monta en la rama `isTenant` del layout `(store)`. Sin UI propia.
 */
export default function TenantStoreChrome() {
  useEffect(() => {
    document.documentElement.setAttribute("data-store-chrome", "tenant");
    return () => {
      document.documentElement.removeAttribute("data-store-chrome");
    };
  }, []);
  return null;
}
