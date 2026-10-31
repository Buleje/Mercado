"use client";

/**
 * El trato de precio de UN cliente para las pantallas que cotizan (ADR-430):
 * Declarar producción, Cobrar aserrío, la venta propuesta de la guía.
 *
 * Es `useTarifasCliente` (el contrato) con dos resguardos que una VISTA PREVIA
 * de plata necesita y el hook de la ficha no:
 *
 *  1. **«Todavía no leí» también es leyendo.** El hook arranca con
 *     `cargando=false` y lo prende recién dentro de su efecto: en el primer
 *     render con un cliente elegido, «sin tarifas, sin error, sin cargar» se
 *     leía como «no tiene trato» y la pantalla cotizaba con la tarifa de la
 *     planta — lo mismo que midió el revisor de ADR-429 (S/ 9 272,68).
 *  2. **Las tarifas son de ESTE cliente.** Al cambiar de cliente, el hook
 *     conserva las del anterior hasta que llega la respuesta nueva: se filtran
 *     por `parteId`, así nunca se cotiza a Juan con el trato de Pedro.
 *
 * `parteId` null = no hay cliente: sin tarifas, sin carga, sin error.
 */
import { useMemo, useState } from "react";
import { useTarifasCliente } from "@/hooks/use-tarifas-cliente";
import type { TarifaCliente } from "@/lib/forestal/precio-cliente";

export interface TratoDelCliente {
  /** Todas las versiones del cliente (aserrío y venta). Vacío mientras se lee. */
  tarifas: TarifaCliente[];
  /** Leyendo (incluido el primer render, antes de que el pedido salga). */
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

export function useTratoDelCliente(parteId: string | null | undefined): TratoDelCliente {
  const id = parteId?.trim() || null;
  const r = useTarifasCliente(id);
  /* Para qué cliente se vio salir el pedido. Mientras no se vio, lo que haya
     en `r.tarifas` es de otro (o de nadie). Cambiar de cliente —incluso volver
     al mismo después de vaciar— lo vuelve a «no visto». */
  const [visto, setVisto] = useState<{ para: string | null; salio: boolean }>({ para: null, salio: false });
  if (visto.para !== id) setVisto({ para: id, salio: false });
  else if (id && r.cargando && !visto.salio) setVisto({ para: id, salio: true });
  const leyendo = Boolean(id) && (r.cargando || visto.para !== id || !visto.salio);

  const tarifas = useMemo(
    () => (id && !leyendo ? r.tarifas.filter((t) => t.parteId === id) : []),
    [id, leyendo, r.tarifas],
  );
  return {
    tarifas,
    cargando: leyendo,
    error: id && !leyendo ? r.error : null,
    recargar: r.recargar,
  };
}
