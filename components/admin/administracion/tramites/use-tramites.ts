"use client";

/** useTramites — la lista de trámites (o los de una persona, con `parteId`). */
import type { TramiteDto } from "@/lib/admin/fichas-tramites-alquileres";
import { useListaAdministracion, type ListaAdministracion } from "../comun/use-lista-administracion";
import { leerTramites, type FiltroTramites } from "./tramites-api";

export function useTramites(filtro: FiltroTramites = {}, activo = true): ListaAdministracion<TramiteDto> {
  return useListaAdministracion<TramiteDto>(
    async () => {
      const r = await leerTramites(filtro);
      return r.ok ? { ok: true, data: r.data.tramites ?? [] } : r;
    },
    JSON.stringify(filtro),
    activo,
  );
}
