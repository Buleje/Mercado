"use client";

/**
 * Las dos cifras rojas de la barra de Reparto: postulantes por revisar (en
 * Equipo) y retiros por pagar (en Pagos). Son las mismas cuentas que muestran
 * esas secciones —del servidor; acá sólo se cuentan filas—, para que se vea
 * que hay algo que hacer sin tener que entrar a mirar.
 *
 * No pide nada al montar: la cabecera llama a `recargar` al entrar y al cambiar
 * de sección (aprobar o pagar cambia las cifras).
 */
import { useCallback, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";

interface Pendientes {
  postulantes: number;
  retiros: number;
}

async function contarPostulantes(): Promise<number> {
  const r = await tenantFetch("/api/admin/driver-applications");
  if (!r.ok) return 0;
  const d = (await r.json()) as { data?: { readAt?: string | null }[] };
  return (d.data ?? []).filter((a) => !a.readAt).length;
}

async function contarRetiros(): Promise<number> {
  const r = await tenantFetch("/api/admin/delivery/payouts");
  if (!r.ok) return 0;
  const d = (await r.json()) as { resumen?: { porPagar?: { cantidad?: number } } };
  return d.resumen?.porPagar?.cantidad ?? 0;
}

export function usePendientesReparto(): Pendientes & { recargar: () => void } {
  const [cifras, setCifras] = useState<Pendientes>({ postulantes: 0, retiros: 0 });
  const ultimo = useRef(0);

  const recargar = useCallback(() => {
    const numero = ++ultimo.current;
    Promise.all([contarPostulantes(), contarRetiros()])
      .then(([postulantes, retiros]) => {
        if (numero === ultimo.current) setCifras({ postulantes, retiros });
      })
      .catch((err) => {
        console.warn("[usePendientesReparto] no se pudieron contar los pendientes:", err);
      });
  }, []);

  return { ...cifras, recargar };
}
