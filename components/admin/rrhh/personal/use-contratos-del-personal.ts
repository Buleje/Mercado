"use client";

/**
 * Los contratos del personal para la columna «Contrato» de Equipo › Personal
 * (19-10: la pestaña Equipo › Contratos se mudó acá). Lee `/api/contratos`
 * —el mismo listado de Documentos › Contratos— sólo si la persona puede
 * gestionar; ese endpoint es de dueño, admin y encargado: con 403 o error la
 * columna no se dibuja y la lista del personal sigue igual.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { contratosPorPersona, type ContratoResumen } from "@/lib/rrhh/contratos-por-persona";

export function useContratosDelPersonal(activo: boolean) {
  const [contratos, setContratos] = useState<ContratoResumen[] | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    fetch("/api/contratos", { credentials: "include", cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`contratos ${r.status}`);
        return r.json() as Promise<{ contratos?: ContratoResumen[] }>;
      })
      .then((d) => {
        if (vigente) setContratos(d.contratos ?? []);
      })
      .catch(() => {
        // Sin permiso o sin red: la columna no se muestra (no es un error de la lista del personal).
        if (vigente) setContratos(null);
      });
    return () => {
      vigente = false;
    };
  }, [activo, vuelta]);

  const resumen = useMemo(() => (contratos ? contratosPorPersona(contratos) : null), [contratos]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  return {
    /** `null` = no se pudo leer o no corresponde: no se dibuja la columna. */
    porPersona: activo ? (resumen?.porPersona ?? null) : null,
    sinPersona: activo ? (resumen?.sinPersona ?? 0) : 0,
    recargar,
  };
}
