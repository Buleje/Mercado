"use client";

/**
 * useFilaEnUrl — «ubicar» un registro en una lista que ya está en pantalla,
 * por `?<param>=<id>` (lo arma el buscador del panel, `lib/admin/busqueda-remota.ts`).
 *
 * A diferencia de `useFichaEnUrl` (la ficha queda abierta y su parámetro vive
 * mientras dure), acá el enlace se CONSUME: al llegar con el parámetro y la
 * lista cargada, se mira si el registro está,
 *  - está: `resaltada` = su id durante unos segundos y la fila se desplaza al
 *    centro (la fila lleva `data-fila-url="<param>:<id>"`; el estilo lo pone
 *    quien la dibuja);
 *  - no está: `noEncontrada` = true durante unos segundos (la pantalla dice
 *    «ese registro ya no existe»);
 * y el parámetro sale de la URL, así volver al módulo no repite la búsqueda.
 *
 * El parámetro va también en `PARAMS_DE_VISTA` (`hooks/use-vista-modulo.ts`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";

/** Cuánto dura la fila resaltada o el aviso. */
export const MS_FILA_RESALTADA = 5000;

export interface FilaEnUrl {
  /** El id de la fila a resaltar, o `null`. */
  resaltada: string | null;
  /** El enlace apuntaba a algo que no está. */
  noEncontrada: boolean;
}

interface Opciones {
  /** ¿La lista ya llegó? Antes de eso no se decide nada. */
  listo: boolean;
  /** ¿Ese id está en la lista que se ve? */
  existe: (id: string) => boolean;
}

/** El selector de la fila que dibuja `param:id`. */
export const selectorDeFila = (param: string, id: string) => `[data-fila-url="${CSS.escape(`${param}:${id}`)}"]`;

export function useFilaEnUrl(param: string, { listo, existe }: Opciones): FilaEnUrl {
  const { id, cerrar } = useFichaEnUrl(param);
  const [estado, setEstado] = useState<{ id: string; hallada: boolean } | null>(null);
  const existeRef = useRef(existe);
  useEffect(() => {
    existeRef.current = existe;
  });

  /* URL → estado: una vez por enlace, con la lista ya cargada. */
  useEffect(() => {
    if (!id || !listo) return;
    setEstado({ id, hallada: existeRef.current(id) });
    cerrar();
  }, [id, listo, cerrar]);

  /* Desplazar hasta la fila (ya dibujada con el estado nuevo) y soltar el resalte. */
  const apagar = useCallback(() => setEstado(null), []);
  useEffect(() => {
    if (!estado) return;
    let cuadro = 0;
    if (estado.hallada) {
      cuadro = requestAnimationFrame(() => {
        document.querySelector(selectorDeFila(param, estado.id))?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    const t = window.setTimeout(apagar, MS_FILA_RESALTADA);
    return () => {
      cancelAnimationFrame(cuadro);
      window.clearTimeout(t);
    };
  }, [estado, param, apagar]);

  return { resaltada: estado?.hallada ? estado.id : null, noEncontrada: estado ? !estado.hallada : false };
}
