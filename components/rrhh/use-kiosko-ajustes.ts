"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { EnlaceGeneradoDTO, ResumenKioskoDTO } from "@/lib/rrhh/kiosko";

/**
 * Datos de `KioskoAsistenciaAjustes`: lee y cambia el kiosko de asistencia
 * por `/api/rrhh/kiosko`. El token en claro sólo vive en memoria (`recien`)
 * hasta que se cierra la tarjeta: la base guarda el hash.
 */

const URL_API = "/api/rrhh/kiosko";
/* Mientras el QR recién generado espera a la tablet: mirar cada 5 s si ya se ató (10 min como mucho). */
const MIRAR_TABLET_MS = 5_000;
const MIRAR_TABLET_VUELTAS = 120;

const soloResumen = (d: ResumenKioskoDTO): ResumenKioskoDTO => ({ activo: d.activo, permitirSinFoto: d.permitirSinFoto, enlace: d.enlace });

async function pedir<T>(metodo: "GET" | "PUT" | "POST" | "DELETE", cuerpo?: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(URL_API, {
      method: metodo,
      headers: metodo === "GET" ? undefined : csrfHeaders({ "Content-Type": "application/json" }),
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!res.ok || !data) {
      const message =
        res.status === 403
          ? "Sólo el dueño o el administrador maneja el kiosko."
          : (data?.message ?? "No se pudo guardar. Intenta de nuevo.");
      return { ok: false, status: res.status, message };
    }
    return { ok: true, data };
  } catch (err) {
    logger.warn("[kiosko-ajustes] falló el pedido", { metodo, error: String(err) });
    return { ok: false, status: 0, message: "Sin conexión. Intenta de nuevo." };
  }
}

export function useKioskoAjustes() {
  const [resumen, setResumen] = useState<ResumenKioskoDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recien, setRecien] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void pedir<ResumenKioskoDTO>("GET").then((r) => {
      if (!vigente) return;
      if (r.ok) setResumen(soloResumen(r.data));
      else setError(r.message);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const correr = useCallback(async <T extends ResumenKioskoDTO>(metodo: "PUT" | "POST" | "DELETE", cuerpo?: unknown): Promise<T | null> => {
    setGuardando(true);
    setError(null);
    const r = await pedir<T>(metodo, cuerpo);
    setGuardando(false);
    if (!r.ok) {
      setError(r.message);
      return null;
    }
    setResumen(soloResumen(r.data));
    return r.data;
  }, []);

  const cambiarActivo = useCallback((activo: boolean) => void correr("PUT", { activo }), [correr]);
  const cambiarSinFoto = useCallback((permitirSinFoto: boolean) => void correr("PUT", { permitirSinFoto }), [correr]);

  // El dueño ve aparecer «Atado a Android · Chrome» sin recargar.
  const esperandoTablet = recien != null && resumen?.enlace != null && resumen.enlace.aparato == null;
  useEffect(() => {
    if (!esperandoTablet) return;
    let vueltas = 0;
    const id = setInterval(() => {
      vueltas += 1;
      if (vueltas > MIRAR_TABLET_VUELTAS) {
        clearInterval(id);
        return;
      }
      void pedir<ResumenKioskoDTO>("GET").then((r) => {
        if (r.ok) setResumen(soloResumen(r.data));
      });
    }, MIRAR_TABLET_MS);
    return () => clearInterval(id);
  }, [esperandoTablet]);

  const generar = useCallback(
    async (venceDias: number) => {
      const r = await correr<EnlaceGeneradoDTO>("POST", { venceDias });
      if (r) setRecien(`${window.location.origin}/kiosko/asistencia/${encodeURIComponent(r.token)}`);
    },
    [correr],
  );

  const revocar = useCallback(async () => {
    const r = await correr("DELETE");
    if (r) setRecien(null);
  }, [correr]);

  return { resumen, cargando, guardando, error, recien, cambiarActivo, cambiarSinFoto, generar, revocar };
}
