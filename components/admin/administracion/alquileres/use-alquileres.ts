"use client";

/** useAlquileres — la lista de locales alquilados (o los de un dueño, con `duenoParteId`). */
import type { AlquilerDto, EstadoAlquiler } from "@/lib/admin/fichas-tramites-alquileres";
import { useListaAdministracion, type ListaAdministracion } from "../comun/use-lista-administracion";
import { leerAlquileres } from "./alquileres-api";

export function useAlquileres(filtro: { estado?: EstadoAlquiler; duenoParteId?: string } = {}, activo = true): ListaAdministracion<AlquilerDto> {
  return useListaAdministracion<AlquilerDto>(
    async () => {
      const r = await leerAlquileres(filtro);
      return r.ok ? { ok: true, data: r.data.alquileres ?? [] } : r;
    },
    JSON.stringify(filtro),
    activo,
  );
}
