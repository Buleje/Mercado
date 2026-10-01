"use client";

/**
 * use-patio-consumos — todo lo que el panel «Patio» de Consumos necesita, en un
 * solo lugar (ADR-431).
 *
 * Compone lo que ya existía sin cambiar sus criterios:
 *  · `useLotesAserrio({ contratoId })` — el patio se pide YA acotado al permiso
 *    cuando «Solo este permiso» está prendido (el filtro lo hace el servidor);
 *  · `useLoteEnCarga` — lote, día y selección para cargar la sierra;
 *  · `useFiltroPatio` sobre la pila (acotada a la especie del lote elegido);
 *  · `resumenPorPermiso` sobre la respuesta ENTERA del patio, no sobre lo
 *    filtrado: la fila de un permiso no puede achicarse porque la tabla de
 *    abajo tenga otro filtro puesto.
 *
 * Vive en la vista (y no dentro del panel) porque el contador de la pestaña
 * «Patio · N trozas» sale del MISMO número que la línea «Qué queda en el patio».
 * El Excel por permiso y el clic por permiso se mudaron a «Trozas disponibles»
 * (2026-09-27) con su tabla; acá quedó lo que carga la sierra.
 */

import { useMemo } from "react";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { piezasLibres } from "@/lib/forestal/lotes-aserrio";
import { trozasDelLote } from "@/lib/forestal/lote-programacion";
import { resumenPorPermiso } from "@/lib/forestal/patio-resumen";
import type { ActionToast } from "../cubicador-toasts";
import { useLotesAserrio } from "./use-lotes-aserrio";
import { useLoteEnCarga } from "./use-lote-en-carga";
import { useFiltroPatio } from "./use-filtro-patio";

type PushToast = (t: Omit<ActionToast, "id" | "exiting">) => number;

export function usePatioConsumos({
  pushToast,
  presetLoteId,
  onPresetLoteUsado,
  alAplicarPreset,
}: {
  pushToast: PushToast;
  presetLoteId?: string | null;
  onPresetLoteUsado?: () => void;
  alAplicarPreset?: () => void;
}) {
  const { contratoFiltro, activo, setSoloEste } = useContratoActivo();
  const lotes = useLotesAserrio({ contratoId: contratoFiltro });
  const carga = useLoteEnCarga({ lotes, pushToast, presetLoteId, onPresetLoteUsado, alAplicarPreset });
  const { loteElegido } = carga;

  /* Con un lote elegido la pila se acota sola a lo que ESE lote puede tomar
     —su especie— (ADR-342); sus piezas apartadas cuentan como disponibles
     PARA ÉL, o la tabla queda vacía mientras el botón promete seis. */
  const baseDelPatio = useMemo(
    () => (loteElegido ? trozasDelLote(lotes.trozas, loteElegido) : lotes.trozas),
    [loteElegido, lotes.trozas],
  );
  const patio = useFiltroPatio(baseDelPatio, { loteId: loteElegido?.id });
  const porPermiso = useMemo(() => resumenPorPermiso(lotes.trozas, patio.ahora), [lotes.trozas, patio.ahora]);

  /**
   * C4 (ADR-431): con «Solo este permiso» prendido, un lote MIXTO muestra sólo
   * sus piezas de este permiso. Como el consumo parcial es válido (ADR-356),
   * el operador consumiría «el lote» dejando en silencio las del otro. Se
   * compara contra el lote tal como lo devuelve `/lotes-aserrio` (sin filtrar).
   */
  const piezasOcultasDelLote = useMemo(() => {
    if (!contratoFiltro || !loteElegido || loteElegido.status !== "abierto") return 0;
    const delLote = piezasLibres(loteElegido).length;
    const visibles = lotes.trozas.filter((t) => t.loteAserrioId === loteElegido.id && !t.consumidaEnId).length;
    return Math.max(0, delLote - visibles);
  }, [contratoFiltro, loteElegido, lotes.trozas]);

  return {
    lotes,
    carga,
    patio,
    porPermiso,
    piezasOcultasDelLote,
    /** Apaga «Solo este permiso» (el aviso del lote mixto ofrece hacerlo). */
    verTodosLosPermisos: () => setSoloEste(false),
    contratoFiltro,
    codigoPermisoActivo: activo?.codigo ?? null,
  };
}

export type EstadoPatioConsumos = ReturnType<typeof usePatioConsumos>;
