"use client";

/**
 * Qué accesos ve este rol y cuáles ancló en la barra (localStorage, como el
 * resto de las preferencias del panel).
 *
 * Clave versionada: la v1 (`admin_header_accesos`) guardaba Cámaras, Archivos,
 * Asistencia y Caja por defecto. Brandon 20-10 pidió la barra con sólo Cámaras
 * PARA TODOS, y cambiar el valor por defecto no alcanzaba a quien ya tenía la
 * lista guardada: la v2 arranca en `["camaras"]` una vez y desde ahí respeta lo
 * que cada uno ancle. La v1 no se lee más ni se borra (no se toca otra preferencia).
 * Sin prefijo `admin-`: `lib/tenant-cache` borra esas claves al cambiar de negocio.
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

export const CLAVE_ANCLADOS = "admin_header_accesos_v2";

export function useAccesosRapidos() {
  const ctx = useContextoPermiso();
  const [guardados, setGuardados] = useLocalStorage<AccesoId[]>(CLAVE_ANCLADOS, [
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
