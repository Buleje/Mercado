"use client";

/**
 * Marcar filas enteras del cubicador de madera y borrarlas de una
 * (Brandon, 2026-10-19). Trabaja sobre el MISMO tilde que ya decidía qué va al
 * PDF, al Excel y al Anexo 04 (`marcadas`): no hay una segunda selección que
 * se contradiga con la primera.
 *
 *   - Shift+clic en una casilla marca (o desmarca) el tramo desde la última
 *     casilla clicada, hacia arriba o hacia abajo.
 *   - «De la fila 50 a la 80» marca por el N° que se ve; 80→50 da lo mismo.
 *   - Escape quita las marcas (salvo escribiendo en una celda o con un modal).
 *   - Eliminar pide confirmación y deja «Deshacer», que devuelve cada fila a
 *     su lugar aunque se haya dictado algo en el medio.
 *
 * La cuenta y los tramos son puros (`lib/forestal/seleccion-filas.ts`).
 */

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { formatNumber } from "@/lib/format";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  devolverFilas,
  idsEntre,
  idsPorNumero,
  quitarFilas,
  resumenDeMarcadas,
  validarRangoDeFilas,
  type ResumenDeMarcadas,
} from "@/lib/forestal/seleccion-filas";
import { isEditableTarget, isModalOpen } from "@/lib/keyboard-guards";
import type { ActionToast } from "../cubicador-toasts";

interface Opciones {
  rows: readonly PiezaCubicada[];
  /** Las filas frescas (el ref del cubicador): el «Deshacer» corre minutos después. */
  leerFilas: () => PiezaCubicada[];
  filasVisibles: readonly { r: PiezaCubicada; indice: number }[];
  /** El N° que muestra la tabla para el índice del lote (depende del orden). */
  numeroDe: (indice: number) => number;
  marcadas: ReadonlySet<string>;
  setMarcadas: Dispatch<SetStateAction<Set<string>>>;
  persist: (next: PiezaCubicada[]) => void;
  pushToast: (t: Omit<ActionToast, "id" | "exiting">) => void;
  /** Para soltar lo que el cubicador recuerda de una fila que ya no está. */
  alQuitar?: (ids: ReadonlySet<string>) => void;
}

export interface MarcarFilas {
  resumen: ResumenDeMarcadas;
  alClicarCasilla: (e: MouseEvent<HTMLInputElement>, id: string) => void;
  /** Marca del N° `desde` al `hasta`. Devuelve el error a mostrar, o `null`. */
  marcarRango: (desde: number | null, hasta: number | null) => string | null;
  /** Shift+Espacio desde una celda: marca o desmarca esa fila. */
  alternarFilaVisible: (posicion: number) => void;
  eliminar: () => Promise<void>;
  quitarMarcas: () => void;
}

const m3Txt = (v: number) => formatNumber(v, 3);
const filasTxt = (n: number) => `${n} ${n === 1 ? "fila" : "filas"}`;

export function useMarcarFilas(op: Opciones): MarcarFilas {
  const { rows, leerFilas, filasVisibles, numeroDe, marcadas, setMarcadas, persist, pushToast, alQuitar } = op;
  const { confirm } = useConfirm();
  /** La última casilla clicada: de ahí sale el tramo del Shift+clic. */
  const anclaRef = useRef<string | null>(null);

  const resumen = useMemo(() => resumenDeMarcadas(rows, marcadas), [rows, marcadas]);

  /* Una marca de una fila que ya no existe (borrada con Ctrl+Supr, lote
     vaciado, otro lote cargado) dejaba al papel filtrando por ella: con sólo
     esa marca, el PDF salía VACÍO. */
  useEffect(() => {
    if (marcadas.size === 0) return;
    const vivas = new Set(rows.map((r) => r.id));
    if ([...marcadas].every((id) => vivas.has(id))) return;
    setMarcadas((prev) => new Set([...prev].filter((id) => vivas.has(id))));
  }, [rows, marcadas, setMarcadas]);

  const quitarMarcas = useCallback(() => {
    anclaRef.current = null;
    setMarcadas(new Set());
  }, [setMarcadas]);

  useEffect(() => {
    if (marcadas.size === 0) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isModalOpen()) return;
      const enCasilla = e.target instanceof HTMLInputElement && e.target.type === "checkbox";
      if (!enCasilla && isEditableTarget(e.target)) return;
      quitarMarcas();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [marcadas.size, quitarMarcas]);

  const aplicar = useCallback((ids: readonly string[], marcar: boolean) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (marcar) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, [setMarcadas]);

  const alClicarCasilla = useCallback((e: MouseEvent<HTMLInputElement>, id: string) => {
    // Leído ANTES del set: en React 19 `currentTarget` es null dentro de un actualizador.
    const marcar = e.currentTarget.checked;
    const tramo = e.shiftKey ? idsEntre(filasVisibles.map(({ r }) => r.id), anclaRef.current, id) : [id];
    anclaRef.current = id;
    aplicar(tramo, marcar);
  }, [filasVisibles, aplicar]);

  const alternarFilaVisible = useCallback((posicion: number) => {
    const fila = filasVisibles[posicion];
    if (!fila) return;
    const id = fila.r.id;
    anclaRef.current = id;
    // Sin leer `marcadas`: así el atajo no cambia de identidad con cada marca.
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [filasVisibles, setMarcadas]);

  const marcarRango = useCallback((desde: number | null, hasta: number | null): string | null => {
    const v = validarRangoDeFilas(desde, hasta, rows.length);
    if (!v.ok) return v.error;
    const tramo = idsPorNumero(filasVisibles.map(({ r, indice }) => ({ id: r.id, numero: numeroDe(indice) })), v.desde, v.hasta);
    const enElTramo = v.hasta - v.desde + 1;
    if (tramo.length === 0) return `Ninguna fila de la ${v.desde} a la ${v.hasta} se ve con el filtro puesto.`;
    anclaRef.current = null;
    /* Reemplaza lo marcado: «de la 50 a la 80» y Eliminar no puede llevarse
       además lo que quedó tildado de antes para el papel. */
    setMarcadas(new Set(tramo));
    if (tramo.length < enElTramo) {
      pushToast({ tono: "info", msg: `${filasTxt(tramo.length)} marcadas`, detail: `${enElTramo - tramo.length} del tramo no se ven por el filtro y no se marcaron.` });
    }
    return null;
  }, [rows.length, filasVisibles, numeroDe, setMarcadas, pushToast]);

  const eliminar = useCallback(async () => {
    const ids = new Set(marcadas);
    const r = resumen;
    if (ids.size === 0) return;
    const ok = await confirm({
      title: `¿Eliminar ${filasTxt(r.filas)}?`,
      description: `Salen del lote ${r.piezas} piezas · ${m3Txt(r.m3)} m³. Lo puedes deshacer desde el aviso.`,
      intent: "danger",
      confirmLabel: `Sí, eliminar ${filasTxt(r.filas)}`,
    });
    if (!ok) return;
    const { quedan, quitadas } = quitarFilas(leerFilas(), ids);
    persist(quedan);
    anclaRef.current = null;
    setMarcadas(new Set());
    alQuitar?.(ids);
    pushToast({
      tono: "warning",
      msg: `${filasTxt(quitadas.length)} ${quitadas.length === 1 ? "eliminada" : "eliminadas"}`,
      detail: `${r.piezas} piezas · ${m3Txt(r.m3)} m³`,
      undo: () => {
        persist(devolverFilas(leerFilas(), quitadas));
        setMarcadas(new Set(ids));
      },
    });
  }, [marcadas, resumen, confirm, leerFilas, persist, setMarcadas, alQuitar, pushToast]);

  return { resumen, alClicarCasilla, marcarRango, alternarFilaVisible, eliminar, quitarMarcas };
}
