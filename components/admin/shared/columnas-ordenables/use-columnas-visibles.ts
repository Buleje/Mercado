"use client";

/**
 * useVisibilidadColumnas — ocultar y mostrar columnas de una tabla, recordado
 * por tabla en este navegador (Brandon, 07-10: «añade la función de ocultar y
 * mostrar columnas»). Va de la mano de `useOrdenColumnas`: el orden dice DÓNDE
 * va cada columna, esto dice SI se pinta; `filtrar(orden)` cruza los dos y lo
 * que sale es lo que recibe `<EnOrden>`.
 *
 * Se guarda sólo lo que el operador eligió (`{ id: true|false }`), no la lista
 * entera: una columna que la tabla agregue mañana arranca con SU valor por
 * defecto, aunque haya una elección vieja guardada.
 *
 * Siempre queda al menos una visible: apagar la última no hace nada, y una
 * preferencia guardada que las apague todas se lee como «todas».
 */

import { useCallback, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

export interface ColumnaElegible {
  id: string;
  /** Cómo se llama en el menú «Columnas». */
  label: string;
  /** Arranca oculta (p. ej. una columna ancha que no entra a 1280 px). */
  ocultaPorDefecto?: boolean;
}

export interface UseVisibilidadColumnasResult {
  columnas: readonly ColumnaElegible[];
  esVisible: (id: string) => boolean;
  /** Prende o apaga una columna (la última visible no se apaga). */
  alternar: (id: string) => void;
  mostrarTodas: () => void;
  /** Vuelve a lo de fábrica (las `ocultaPorDefecto`, ocultas). */
  restablecer: () => void;
  /** Cuántas se ven. */
  cuantasVisibles: number;
  /** Difiere de lo de fábrica. */
  cambiado: boolean;
  /** Deja en `orden` sólo las visibles; ids que este hook no conoce pasan tal cual. */
  filtrar: (orden: readonly string[]) => string[];
}

type Eleccion = Record<string, boolean>;

/** Lo que se ve, de la elección guardada y los valores de fábrica. PURO. */
export function columnasQueSeVen(columnas: readonly ColumnaElegible[], eleccion: Eleccion | null): Set<string> {
  const ven = new Set(
    columnas.filter((c) => (eleccion && typeof eleccion[c.id] === "boolean" ? eleccion[c.id] : !c.ocultaPorDefecto)).map((c) => c.id),
  );
  return ven.size > 0 ? ven : new Set(columnas.map((c) => c.id));
}

/**
 * @param clave  única por tabla (se guarda en `columnas-visibles:<clave>`).
 * @param columnas  las columnas que se pueden ocultar, en el orden del menú.
 */
export function useVisibilidadColumnas(clave: string, columnas: readonly ColumnaElegible[]): UseVisibilidadColumnasResult {
  const [guardado, setGuardado] = useLocalStorage<Eleccion | null>(`columnas-visibles:${clave}`, null);
  const firma = columnas.map((c) => `${c.id}:${c.ocultaPorDefecto ? 0 : 1}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `firma` resume `columnas` (puede ser un array nuevo en cada render)
  const ven = useMemo(() => columnasQueSeVen(columnas, guardado), [guardado, firma]);

  const alternar = useCallback(
    (id: string) => {
      const prendida = ven.has(id);
      if (prendida && ven.size <= 1) return;
      setGuardado({ ...(guardado ?? {}), [id]: !prendida });
    },
    [ven, guardado, setGuardado],
  );
  const mostrarTodas = useCallback(
    () => setGuardado(Object.fromEntries(columnas.map((c) => [c.id, true]))),
    [columnas, setGuardado],
  );
  const restablecer = useCallback(() => setGuardado(null), [setGuardado]);
  const esVisible = useCallback((id: string) => ven.has(id), [ven]);
  const filtrar = useCallback(
    (orden: readonly string[]) => orden.filter((id) => ven.has(id) || !columnas.some((c) => c.id === id)),
    [ven, columnas],
  );
  const cambiado = columnas.some((c) => ven.has(c.id) === !!c.ocultaPorDefecto);

  return { columnas, esVisible, alternar, mostrarTodas, restablecer, cuantasVisibles: ven.size, cambiado, filtrar };
}
