"use client";

/**
 * use-lote-en-carga — cargar la sierra desde Consumos (ADR-340/342), fuera de la
 * vista.
 *
 * Qué lote entra a la sierra, qué día y qué piezas están tildadas. Vivía
 * repartido en tres pedazos de `CtpConsumosView` (el estado, el lote que manda
 * la pestaña Lotes y el menú de lotes); acá está junto y SIN cambiar el
 * comportamiento: la selección de trozas es lo más caro de la pantalla y se
 * movió tal cual.
 */

import { useEffect, useMemo, useState } from "react";
import { Boxes, ClipboardList, Layers, RotateCcw } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { ESTADO_LOTE, esLoteDeInventario, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { trozasDelLote } from "@/lib/forestal/lote-programacion";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import type { ActionToast } from "../cubicador-toasts";
import type { EstadoLotesAserrio } from "./use-lotes-aserrio";

type PushToast = (t: Omit<ActionToast, "id" | "exiting">) => number;

/** El orden del menú: los abiertos primero, después los aserrados y los cerrados. */
const PRIORIDAD = { abierto: 0, consumido: 1, cerrado: 2 } as const;

export interface LoteEnCarga {
  loteCarga: string;
  setLoteCarga: (id: string) => void;
  loteElegido: LoteAserrio | null;
  lotesAbiertos: LoteAserrio[];
  lotesParaElegir: LoteAserrio[];
  fechaConsumo: string;
  setFechaConsumo: (v: string) => void;
  /** Lo tildado en la tabla del patio (ADR-345). */
  seleccion: Set<string>;
  setSeleccion: (ids: Set<string>) => void;
  /** Las filas de «Consumir en un lote…», con piezas y m³ de cada lote. */
  opcionesLote: MenuAccion[];
}

export function useLoteEnCarga({
  lotes,
  pushToast,
  presetLoteId,
  onPresetLoteUsado,
  alAplicarPreset,
}: {
  lotes: EstadoLotesAserrio;
  pushToast: PushToast;
  /** Lote que llega desde la pestaña Lotes con «Cargar» (ADR-342). */
  presetLoteId?: string | null;
  onPresetLoteUsado?: () => void;
  /** Elegir un lote y quedarse en el cuadro no hace nada visible: lleva al patio. */
  alAplicarPreset?: () => void;
}): LoteEnCarga {
  /** Cargar la sierra (ADR-340): el lote que se está aserrando y el día. */
  const [loteCarga, setLoteCarga] = useState("");
  /* «Hoy» de Pucallpa, no de UTC: a las 20:00 locales el consumo nacía fechado mañana. */
  const [fechaConsumo, setFechaConsumo] = useState(() => hoyEnLima());
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /** El lote que se está reabriendo, para que su fila del menú muestre el spinner. */
  const [reabriendo, setReabriendo] = useState<string | null>(null);

  const lotesAbiertos = useMemo(() => lotes.lotes.filter((l) => l.status === "abierto"), [lotes.lotes]);
  /**
   * TODOS los lotes, no sólo los abiertos (Brandon, 2026-09-01: "tiene que
   * aparecer los lotes que he creado, sea que ya se consumió o tenga trozas").
   * Uno ya consumido no puede recibir piezas nuevas —el servidor lo bloquea a
   * propósito— pero un lote que "desaparece" se lee como un lote perdido. El que
   * no es "abierto" abre una ficha de sólo lectura en vez del picker de trozas.
   */
  const lotesParaElegir = useMemo(
    () =>
      [...lotes.lotes].sort((a, b) => {
        const dif = PRIORIDAD[a.status] - PRIORIDAD[b.status];
        return dif !== 0 ? dif : b.fechaApertura.localeCompare(a.fechaApertura);
      }),
    [lotes.lotes],
  );
  const loteElegido = useMemo(
    () => lotesParaElegir.find((l) => l.id === loteCarga) ?? null,
    [lotesParaElegir, loteCarga],
  );
  const { reabrirLote } = lotes;
  /** Cuánta madera de su especie tiene cada lote esperando: se elige con el dato a la vista. */
  const disponiblePorLote = useMemo(() => {
    const mapa = new Map<string, { piezas: number; volumen: number }>();
    for (const l of lotesAbiertos) {
      const suyas = trozasDelLote(lotes.trozas, l);
      mapa.set(l.id, {
        piezas: suyas.length,
        volumen: Math.round(suyas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
      });
    }
    return mapa;
  }, [lotesAbiertos, lotes.trozas]);

  /* El lote que mandó la pestaña Lotes se aplica cuando la lista ya cargó: antes
     sería un id que el menú todavía no tiene entre sus opciones. */
  useEffect(() => {
    if (!presetLoteId || !lotesAbiertos.some((l) => l.id === presetLoteId)) return;
    setLoteCarga(presetLoteId);
    alAplicarPreset?.();
    onPresetLoteUsado?.();
  }, [presetLoteId, lotesAbiertos, onPresetLoteUsado, alAplicarPreset]);

  /**
   * Los lotes con lo que cada uno TIENE de verdad: piezas y m³ a la derecha, y
   * los de INVENTARIO con su propio ícono (nacieron de una declaración, no
   * tienen trozas que tildar — [[ctp-lote-inventario-2026-08-31]]).
   */
  const opcionesLote: MenuAccion[] = useMemo(() => {
    const lista: MenuAccion[] = lotesParaElegir.map((l) => {
      const inventario = esLoteDeInventario(l);
      const hay = disponiblePorLote.get(l.id);
      const cerrado = l.status !== "abierto";
      /* Un lote ASERRADO se puede seguir cargando: se reabre (Brandon,
         2026-09-02). Uno CERRADO no —producido y despachado—: sólo su ficha. */
      const reabrible = l.status === "consumido";
      return {
        id: `lote-${l.id}`,
        label: `${l.code} · ${l.speciesCommon ?? "sin especie"}`,
        icon: inventario ? ClipboardList : reabrible ? RotateCcw : Boxes,
        activo: loteCarga === l.id,
        busy: reabriendo === l.id,
        hint: reabrible
          ? "Ya aserrado — se reabre para seguir cargándolo con más madera"
          : cerrado
            ? `${ESTADO_LOTE[l.status].label}${inventario ? " · declarado por inventario" : ""}`
            : inventario
              ? "Declarado por inventario: no tiene trozas que tildar"
              : hay && hay.piezas > 0
                ? "Listo para cargar la sierra"
                /* Desde ADR-393 un lote puede quedarse sin madera por su
                   PERMISO, no por su especie: el mensaje nombra la causa real. */
                : l.permiso
                  ? `Sin ${l.speciesCommon ?? "madera"} del permiso ${l.permiso} en el patio`
                  : "Sin madera de esa especie en el patio",
        meta: cerrado ? undefined : hay && hay.piezas > 0 ? `${hay.piezas} pza · ${fmtM3(hay.volumen)} m³` : "—",
        onSelect: () => {
          setSeleccion(new Set());
          if (!reabrible) {
            setLoteCarga(l.id);
            return;
          }
          /* Reabrir y dejarlo elegido: el gesto es uno solo —«seguir cargando
             este lote»— y partirlo en dos clics obligaría a buscarlo de nuevo. */
          setReabriendo(l.id);
          reabrirLote(l.id)
            .then((r) => {
              setLoteCarga(l.id);
              pushToast({
                tono: "success",
                msg: `Lote ${r.code} reabierto`,
                detail:
                  r.piezasConsumidas > 0
                    ? `Sus ${r.piezasConsumidas} pieza(s) ya aserradas siguen atadas a su corrida; ahora se le puede agregar más madera.`
                    : "Ahora se le puede agregar más madera.",
              });
            })
            .catch((err: unknown) => {
              pushToast({
                tono: "warning",
                msg: "No se pudo reabrir el lote",
                detail: err instanceof Error ? err.message : String(err),
              });
            })
            .finally(() => setReabriendo(null));
        },
      };
    });
    /* Salir del lote sin recargar la pantalla: volver a ver el patio entero. */
    if (loteCarga) {
      lista.unshift({
        id: "lote-ninguno",
        label: "Ver todo el patio",
        icon: Layers,
        hint: "Sin lote: la pila completa, sin acotar a una especie",
        onSelect: () => {
          setLoteCarga("");
          setSeleccion(new Set());
        },
      });
    }
    return lista;
  }, [lotesParaElegir, disponiblePorLote, loteCarga, reabrirLote, pushToast, reabriendo]);

  return {
    loteCarga,
    setLoteCarga,
    loteElegido,
    lotesAbiertos,
    lotesParaElegir,
    fechaConsumo,
    setFechaConsumo,
    seleccion,
    setSeleccion,
    opcionesLote,
  };
}
