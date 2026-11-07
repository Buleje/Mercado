"use client";

import { useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { RespuestaEmparejar } from "@/lib/rrhh/kiosko";

/**
 * Al abrir el kiosko, la tablet se ata al enlace (`/api/kiosko/emparejar`,
 * `lib/rrhh/kiosko-aparato.ts`): la primera que lo abre queda con una cookie
 * httpOnly; cualquier otro aparato ve el aviso y no puede marcar.
 */
export type EstadoEmparejar =
  | { id: "cargando" }
  | { id: "listo"; fotoObligatoria: boolean }
  | { id: "error"; message: string };

export function useEmparejarKiosko(token: string): EstadoEmparejar {
  const [estado, setEstado] = useState<EstadoEmparejar>({ id: "cargando" });

  useEffect(() => {
    let vigente = true;
    void (async () => {
      let r: RespuestaEmparejar;
      try {
        const res = await fetch("/api/kiosko/emparejar", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ token }),
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as RespuestaEmparejar | null;
        r =
          data && typeof data === "object" && "ok" in data
            ? data
            : { ok: false, error: `http_${res.status}`, message: "No se pudo abrir el kiosko. Recarga la página." };
      } catch (err) {
        logger.warn("[kiosko] no se pudo atar la tablet", { error: String(err) });
        r = { ok: false, error: "red", message: "Sin conexión. Revisa el internet de la tablet y recarga la página." };
      }
      if (!vigente) return;
      setEstado(r.ok ? { id: "listo", fotoObligatoria: r.fotoObligatoria } : { id: "error", message: r.message });
    })();
    return () => {
      vigente = false;
    };
  }, [token]);

  return estado;
}
