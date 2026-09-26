"use client";

/**
 * useOrdenColumnas — arrastrar el título de una columna para cambiarla de
 * lugar, y que la tabla lo recuerde (Brandon, 2026-09-26).
 *
 * Pensado para las 27 tablas con autofiltro, casi todas con sus `<th>`
 * escritos a mano: la tabla sólo tiene que
 *   1. poner `data-col="<id>"` en cada `<th>` movible,
 *   2. colgar `refCabecera` en su `<thead>`,
 *   3. pintar cabecera, filas y pie con `<EnOrden orden={orden} celdas={{…}} />`.
 * Los eventos se escuchan UNA vez en el `<thead>` (delegación): no hay que
 * tocar los componentes de cabecera propios (`ThSort`, …) más que para que
 * dejen pasar `data-col`.
 *
 * Se arrastra con el mouse (HTML5 drag & drop) y con el teclado: Alt+← / Alt+→
 * con el foco en cualquier control de la cabecera. En el celular no hay tabla
 * (son tarjetas), así que no hace falta el toque.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { correrColumna, fusionarOrden, moverColumna, ordenCambiado } from "@/lib/admin/orden-columnas";

/** Lo que, apretado, NO arrastra: escribir en un buscador de la cabecera o
 *  tildar una casilla del autofiltro tiene que seguir funcionando. */
const NO_ARRASTRA = "input, textarea, select, [contenteditable], [data-no-arrastrar], details[open] > :not(summary)";

export interface UseOrdenColumnasResult {
  /** Los ids en el orden a pintar (lo guardado, cruzado con las columnas de hoy). */
  orden: string[];
  mover: (desde: string, hasta: string, lado: "antes" | "despues") => void;
  /** Vuelve al orden de fábrica. */
  restablecer: () => void;
  /** El orden difiere del de fábrica: se ofrece «Restablecer». */
  cambiado: boolean;
  /** Va en el `<thead>`: escucha el arrastre y el teclado de todas sus cabeceras. */
  refCabecera: (el: HTMLTableSectionElement | null) => void;
}

/**
 * @param clave  única por tabla (se guarda en `orden-columnas:<clave>`).
 * @param porDefecto  los ids movibles en su orden de fábrica. Puede incluir
 *   columnas que hoy estén ocultas: el orden las recuerda igual.
 */
export function useOrdenColumnas(clave: string, porDefecto: readonly string[]): UseOrdenColumnasResult {
  const [guardado, setGuardado] = useLocalStorage<string[] | null>(`orden-columnas:${clave}`, null);
  const firma = porDefecto.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `firma` resume `porDefecto` (un array nuevo en cada render)
  const orden = useMemo(() => fusionarOrden(guardado, porDefecto), [guardado, firma]);

  /* Los listeners viven fuera de React: leen el orden de la ref, no del cierre. */
  const ordenRef = useRef(orden);
  ordenRef.current = orden;

  const mover = useCallback(
    (desde: string, hasta: string, lado: "antes" | "despues") =>
      setGuardado(moverColumna(ordenRef.current, desde, hasta, lado)),
    [setGuardado],
  );
  const restablecer = useCallback(() => setGuardado(null), [setGuardado]);

  /* Con el teclado, React mueve el nodo que tenía el foco y el navegador lo
     suelta: se devuelve a la misma cabecera después de pintar. */
  const enfocarTras = useRef<string | null>(null);
  const cabecera = useRef<HTMLTableSectionElement | null>(null);
  useLayoutEffect(() => {
    const id = enfocarTras.current;
    if (!id || !cabecera.current) return;
    enfocarTras.current = null;
    const th = cabecera.current.querySelector<HTMLElement>(`th[data-col="${CSS.escape(id)}"]`);
    const foco = th?.querySelector<HTMLElement>("button, summary, [tabindex]") ?? th;
    foco?.focus();
  }, [orden]);

  const limpiar = useRef<(() => void) | null>(null);
  const refCabecera = useCallback(
    (thead: HTMLTableSectionElement | null) => {
      limpiar.current?.();
      limpiar.current = null;
      cabecera.current = thead;
      if (!thead) return;

      let arrastrando: string | null = null;
      let destino: HTMLElement | null = null;
      const thDe = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>("th[data-col]") ?? null;
      const sacarMarca = () => {
        if (destino) delete destino.dataset.soltar;
        destino = null;
      };
      const terminar = () => {
        sacarMarca();
        thead.querySelectorAll<HTMLElement>("th[data-arrastrando]").forEach((th) => delete th.dataset.arrastrando);
        arrastrando = null;
      };
      const ladoDe = (th: HTMLElement, x: number): "antes" | "despues" => {
        const r = th.getBoundingClientRect();
        return x < r.left + r.width / 2 ? "antes" : "despues";
      };

      /* `draggable` se decide al apretar: sobre un buscador o una casilla, no
         (si no, el navegador arrastra la columna en vez de seleccionar texto). */
      const alApretar = (e: PointerEvent) => {
        const th = thDe(e);
        if (th) th.draggable = !(e.target as Element).closest(NO_ARRASTRA);
      };
      const alEmpezar = (e: DragEvent) => {
        const th = thDe(e);
        if (!th?.dataset.col) return;
        arrastrando = th.dataset.col;
        th.dataset.arrastrando = "1";
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          // Firefox no arranca el arrastre sin datos.
          e.dataTransfer.setData("text/plain", arrastrando);
        }
      };
      const alPasar = (e: DragEvent) => {
        if (!arrastrando) return;
        const th = thDe(e);
        if (!th?.dataset.col) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        if (th.dataset.col === arrastrando) return sacarMarca();
        const lado = ladoDe(th, e.clientX);
        if (destino !== th) sacarMarca();
        destino = th;
        th.dataset.soltar = lado;
      };
      const alSoltar = (e: DragEvent) => {
        const th = thDe(e);
        if (arrastrando && th?.dataset.col) {
          e.preventDefault();
          mover(arrastrando, th.dataset.col, ladoDe(th, e.clientX));
        }
        terminar();
      };
      const alTeclear = (e: KeyboardEvent) => {
        if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        /* Dentro de un buscador, Alt/Option+← mueve el cursor por palabras. */
        if ((e.target as Element).closest?.(NO_ARRASTRA)) return;
        const th = thDe(e);
        if (!th?.dataset.col) return;
        e.preventDefault();
        const visibles = [...thead.querySelectorAll<HTMLElement>("th[data-col]")].map((x) => x.dataset.col as string);
        const id = th.dataset.col;
        enfocarTras.current = id;
        setGuardado(correrColumna(ordenRef.current, id, e.key === "ArrowLeft" ? -1 : 1, visibles));
      };

      thead.addEventListener("pointerdown", alApretar);
      thead.addEventListener("dragstart", alEmpezar);
      thead.addEventListener("dragover", alPasar);
      thead.addEventListener("drop", alSoltar);
      thead.addEventListener("dragend", terminar);
      thead.addEventListener("keydown", alTeclear);
      limpiar.current = () => {
        thead.removeEventListener("pointerdown", alApretar);
        thead.removeEventListener("dragstart", alEmpezar);
        thead.removeEventListener("dragover", alPasar);
        thead.removeEventListener("drop", alSoltar);
        thead.removeEventListener("dragend", terminar);
        thead.removeEventListener("keydown", alTeclear);
      };
    },
    [mover, setGuardado],
  );
  useEffect(() => () => limpiar.current?.(), []);

  return { orden, mover, restablecer, cambiado: ordenCambiado(orden, porDefecto), refCabecera };
}
