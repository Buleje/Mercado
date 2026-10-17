"use client";

/**
 * Qué accesos ve este rol y cuáles ancló en la barra (localStorage
 * `admin_header_accesos`, como el resto de las preferencias del panel).
 */
import { useCallback, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
import {
  ACCESOS,
  ANCLADOS_POR_DEFECTO,
  accesoPermitido,
  esAccesoId,
  type AccesoId,
} from "./accesos-rapidos";

export function useAccesosRapidos() {
  const ctx = useContextoPermiso();
  const [guardados, setGuardados] = useLocalStorage<AccesoId[]>("admin_header_accesos", [
    ...ANCLADOS_POR_DEFECTO,
  ]);
  // Lo guardado pasa por el filtro: un id viejo o basura no rompe la barra.
  const anclados = useMemo(
    () =>
      new Set<AccesoId>(
        Array.isArray(guardados) ? guardados.filter(esAccesoId) : ANCLADOS_POR_DEFECTO,
      ),
    [guardados],
  );
  const permitidos = useMemo(() => ACCESOS.filter((a) => accesoPermitido(ctx, a)), [ctx]);
  const enLaBarra = useMemo(
    () => permitidos.filter((a) => anclados.has(a.id)),
    [permitidos, anclados],
  );

  const alternarAnclado = useCallback(
    (id: AccesoId) =>
      setGuardados((prev) => {
        const lista = Array.isArray(prev) ? prev.filter(esAccesoId) : [...ANCLADOS_POR_DEFECTO];
        return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
      }),
    [setGuardados],
  );

  return { permitidos, enLaBarra, anclados, alternarAnclado };
}
