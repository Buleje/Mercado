"use client";

/**
 * useBaseVerificacion — la base pública del negocio para los QR
 * (`https://<dominio>` · subdominio · `…/t/<slug>`), pedida al servidor una vez
 * por pestaña. Mientras llega, `base` es `null`: el botón que imprime espera
 * (sin caer a `window.location.origin`, ver `lib/base-verificacion-cliente.ts`).
 *
 * Fuera de React (un `async` que arma el papel), usar `obtenerBaseVerificacion()`.
 */

import { useEffect, useState } from "react";
import { obtenerUrlPublica } from "@/lib/base-verificacion-cliente";
import type { FuenteBasePublica } from "@/lib/tenant-url-publica";

export { obtenerBaseVerificacion } from "@/lib/base-verificacion-cliente";

export function useBaseVerificacion(): { base: string | null; fuente: FuenteBasePublica | null; error: string | null } {
  const [estado, setEstado] = useState<{ base: string | null; fuente: FuenteBasePublica | null; error: string | null }>({
    base: null,
    fuente: null,
    error: null,
  });
  useEffect(() => {
    let vivo = true;
    obtenerUrlPublica().then(
      (r) => vivo && setEstado({ base: r.base, fuente: r.fuente, error: null }),
      (err: unknown) => vivo && setEstado({ base: null, fuente: null, error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}
