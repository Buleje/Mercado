"use client";

import { useCallback, useEffect, useState } from "react";
import { NOMBRE_SIN_MARCAR, guardarNombreSinMarcar, leerNombreSinMarcar } from "@/lib/forestal/reparto-por-distribuir";

/**
 * El nombre del bloque «Sin marcar», guardado junto a las casillas «Distribuido»
 * (misma hoja, misma clave base). Se lee tras montar: el servidor no ve localStorage.
 */
export function useNombreSinMarcar(clave: string): [string, (nuevo: string) => void] {
  const [nombre, setNombre] = useState(NOMBRE_SIN_MARCAR);
  useEffect(() => {
    setNombre(leerNombreSinMarcar(typeof window === "undefined" ? null : window.localStorage, clave));
  }, [clave]);
  const cambiar = useCallback(
    (nuevo: string) => setNombre(guardarNombreSinMarcar(typeof window === "undefined" ? null : window.localStorage, clave, nuevo)),
    [clave],
  );
  return [nombre, cambiar];
}
