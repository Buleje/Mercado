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
 * «Patio · N trozas» sale del MISMO número que la KPI y la tabla.
 */

import { useCallback, useMemo, useState } from "react";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { piezasLibres } from "@/lib/forestal/lotes-aserrio";
import { trozasDelLote } from "@/lib/forestal/lote-programacion";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { hojasDelPatioPorPermiso, nombreArchivoPatio } from "@/lib/forestal/patio-excel";
import { ETIQUETA_TRAMO_DIAS, resumenPorPermiso } from "@/lib/forestal/patio-resumen";
import type { ActionToast } from "../cubicador-toasts";
import { useLotesAserrio } from "./use-lotes-aserrio";
import { useLoteEnCarga } from "./use-lote-en-carga";
import { useFiltroPatio, type EstadoFiltroPatio, type RangoFiltro } from "./use-filtro-patio";

type PushToast = (t: Omit<ActionToast, "id" | "exiting">) => number;

const rangoEscrito = (r: RangoFiltro, unidad: string): string[] =>
  r.min == null && r.max == null
    ? []
    : [r.min != null && r.max != null ? `${r.min}–${r.max} ${unidad}` : r.min != null ? `≥ ${r.min} ${unidad}` : `≤ ${r.max} ${unidad}`];

/**
 * TODOS los campos que acotan la pila, escritos como se leen: los usa la nota
 * del panel de indicadores y la hoja «Qué se exportó» del Excel. Una lista para
 * las dos, para que no puedan contar distinto.
 */
export function camposDelFiltroPatio(p: EstadoFiltroPatio): { label: string; valores: string[] }[] {
  return [
    { label: "Búsqueda", valores: p.texto.trim() ? [`«${p.texto.trim()}»`] : [] },
    { label: "Especie", valores: p.especie },
    { label: "Guía", valores: p.guia },
    { label: "Permiso", valores: p.permiso },
    { label: "Resolución", valores: p.resolucion },
    { label: "Proveedor", valores: p.proveedor },
    { label: "Días en el patio", valores: p.tramos.map((t) => ETIQUETA_TRAMO_DIAS[t]) },
    { label: "Largo", valores: rangoEscrito(p.largo, "m") },
    { label: "Diámetro", valores: rangoEscrito(p.diametro, "cm") },
    { label: "Sin código", valores: p.sinCodigo ? ["sí"] : [] },
    { label: "Guía CITES", valores: p.cites ? ["sí"] : [] },
  ];
}

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

  /** Clic en una fila de «Por permiso»: lo filtra, y otro clic lo suelta. */
  const alternarPermiso = useCallback(
    (p: string) => patio.set.permiso(patio.permiso.includes(p) ? patio.permiso.filter((x) => x !== p) : [p]),
    [patio.permiso, patio.set],
  );

  const [descargando, setDescargando] = useState(false);
  /** 1 archivo, 1 llamada: «Por permiso», una hoja por permiso y «Qué se exportó». */
  const descargarExcel = useCallback(async () => {
    setDescargando(true);
    try {
      const filtros = camposDelFiltroPatio(patio)
        .filter((c) => c.valores.length > 0)
        .map((c) => `${c.label}: ${c.valores.join(" o ")}`);
      if (patio.soloLibres) filtros.push("Solo libres: sí");
      const hojas = hojasDelPatioPorPermiso({
        porPermiso,
        trozas: patio.visibles,
        ahora: patio.ahora,
        filtros,
        alcance: contratoFiltro ? (activo?.codigo ?? null) : null,
        truncado: lotes.patioTruncado
          ? { total: lotes.patioTruncado.hay, devueltas: lotes.patioTruncado.leidas }
          : null,
      });
      await exportSheetsToExcel(hojas, nombreArchivoPatio(patio.ahora));
    } catch (e) {
      pushToast({
        tono: "error",
        msg: "No se pudo descargar el Excel del patio",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setDescargando(false);
    }
  }, [patio, porPermiso, lotes.patioTruncado, contratoFiltro, activo, pushToast]);

  return {
    lotes,
    carga,
    patio,
    porPermiso,
    alternarPermiso,
    piezasOcultasDelLote,
    /** Apaga «Solo este permiso» (el aviso del lote mixto ofrece hacerlo). */
    verTodosLosPermisos: () => setSoloEste(false),
    contratoFiltro,
    codigoPermisoActivo: activo?.codigo ?? null,
    descargarExcel,
    descargando,
  };
}

export type EstadoPatioConsumos = ReturnType<typeof usePatioConsumos>;
