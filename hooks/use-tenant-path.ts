"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/**
 * useTenantPath — devuelve un helper que prefija una ruta con `/t/{slug}`
 * cuando el usuario navega dentro de una tienda tenant-scoped.
 *
 * Funciona aun si el middleware reescribió la ruta server-side (ej.
 * /t/mi-pollo/cuenta → /cuenta para enrutar): leemos `window.location.pathname`
 * tras el mount como fallback porque `usePathname()` puede reflejar la ruta
 * reescrita.
 *
 * Ejemplo:
 *   const path = useTenantPath();
 *   path("/cuenta/pedidos") // → "/t/mi-pollo/cuenta/pedidos" en /t/mi-pollo/...
 *                           // → "/cuenta/pedidos" en /marketplace/... o root
 *
 * No prefija URLs externas (http://, https://, mailto:, tel:, #, ?).
 */
export function useTenantPath() {
  const pathname = usePathname() ?? "";
  const [browserPath, setBrowserPath] = useState<string>(pathname);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBrowserPath(window.location.pathname);
    }
  }, [pathname]);

  const slug = useMemo(() => {
    const fromBrowser = browserPath.match(/^\/t\/([^/]+)/)?.[1];
    if (fromBrowser) return fromBrowser;
    return pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null;
  }, [pathname, browserPath]);

  return useMemo(() => {
    return (path: string): string => {
      if (!slug) return path;
      if (!path) return path;
      if (/^(https?:|mailto:|tel:|#|\?)/i.test(path)) return path;
      if (path.startsWith(`/t/${slug}`)) return path;
      if (path.startsWith("/")) return `/t/${slug}${path}`;
      return path;
    };
  }, [slug]);
}
