"use client";

/**
 * El precio por pie tablar que la persona tiene pactado para el aserrío
 * (ADR-430), para armar «pt × S/ por pt» en un adelanto por servicio.
 *
 * Sólo si la ficha está vinculada a una parte del directorio forestal. Sin
 * vínculo, sin módulo forestal (403) o sin trato, devuelve `null` y el precio
 * se escribe a mano: es una sugerencia, nunca un bloqueo.
 */

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

type Tarifa = { servicio?: string; vigenteDesde?: string; basePt?: number | null };

export function useTarifaAserrio(parteId: string | null | undefined, activo: boolean, fecha: string) {
  /* Con la parte a la que pertenecen: al cambiar de persona, las tarifas de la
     anterior no se usan mientras llegan las nuevas. */
  const [leidas, setLeidas] = useState<{ parteId: string; tarifas: Tarifa[] } | null>(null);

  useEffect(() => {
    if (!activo || !parteId) return;
    let vivo = true;
    fetch(`/api/admin/forestal/tarifas-cliente?parteId=${encodeURIComponent(parteId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tarifas?: Tarifa[] } | null) => {
        if (vivo) setLeidas({ parteId, tarifas: Array.isArray(j?.tarifas) ? j.tarifas : [] });
      })
      .catch((e) => logger.warn("[adelantos] no se pudo leer la tarifa del cliente", { error: String(e) }));
    return () => {
      vivo = false;
    };
  }, [activo, parteId]);

  const tarifas = leidas && leidas.parteId === parteId ? leidas.tarifas : null;
  if (!activo || !parteId || !tarifas) return null;
  /* La que rige ese día: la más nueva que ya empezó. */
  const vigente = tarifas
    .filter((t) => t.servicio === "aserrio" && t.basePt != null && t.basePt > 0 && (t.vigenteDesde ?? "") <= fecha)
    .sort((a, b) => ((a.vigenteDesde ?? "") < (b.vigenteDesde ?? "") ? 1 : -1))[0];
  return vigente ? { precioPt: Number(vigente.basePt), desde: vigente.vigenteDesde ?? null } : null;
}
