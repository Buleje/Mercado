"use client";

/**
 * El trato de VENTA del cliente de una guía de salida (ADR-430).
 *
 * La guía sabe a quién va la madera por su destinatario (nombre y documento,
 * como texto). Si ese destinatario es alguien del Directorio con un precio de
 * venta pactado, la venta de cada renglón se propone con SU precio por PT —no
 * con el que se puso al declarar el paquete—. La búsqueda es la misma que usa
 * la venta de la guía ya registrada (`parteDelDestinatario`): si una pantalla
 * encontrara al cliente y la otra no, la guía propondría un precio y anotaría
 * la deuda a otro nombre.
 */
import { useMemo } from "react";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { parteDelDestinatario, type DestinatarioDeGuia } from "@/lib/forestal/cliente-de-la-guia";
import type { TratoDeVenta } from "@/lib/forestal/despacho-lista";
import { tarifaVigente } from "@/lib/forestal/precio-cliente";
import { useEspeciesCatalogo } from "./use-especies-catalogo";
import { useTratoDelCliente } from "./use-trato-del-cliente";

export interface EstadoTratoDeVenta {
  /** El trato vigente el día de la guía, listo para `filasDeCorridas`. `null` = no hay. */
  trato: TratoDeVenta | null;
  /** El cliente encontrado en el Directorio, aunque no tenga trato. */
  cliente: { id: string; nombre: string } | null;
  cargando: boolean;
  error: string | null;
}

export function useTratoDeVenta(destinatario: DestinatarioDeGuia | null | undefined, fecha: string): EstadoTratoDeVenta {
  const hayDestinatario = Boolean(destinatario?.nombre?.trim());
  const directorio = useDirectorioForestal({ activo: hayDestinatario });
  const parte = useMemo(
    () => (hayDestinatario ? parteDelDestinatario(directorio.partes, destinatario) : null),
    [hayDestinatario, directorio.partes, destinatario],
  );
  const lectura = useTratoDelCliente(parte?.id ?? null);
  const catalogo = useEspeciesCatalogo();
  const vigente = tarifaVigente(lectura.tarifas, "venta", fecha);

  const trato = useMemo<TratoDeVenta | null>(
    () => (parte && vigente ? { parteNombre: parte.nombre, tarifa: vigente, grupos: catalogo.grupos } : null),
    [parte, vigente, catalogo.grupos],
  );
  const usaGrupos = (vigente?.grupos.length ?? 0) > 0;
  return {
    trato,
    cliente: parte ? { id: parte.id, nombre: parte.nombre } : null,
    cargando: (hayDestinatario && directorio.cargando) || lectura.cargando || (usaGrupos && catalogo.cargando),
    error: lectura.error,
  };
}
