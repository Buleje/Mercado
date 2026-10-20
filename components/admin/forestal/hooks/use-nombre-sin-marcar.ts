"use client";

import { useCallback, useEffect, useState } from "react";
import { NOMBRE_SIN_MARCAR, guardarNombreSinMarcar, leerNombreSinMarcar, normalizarNombreSinMarcar } from "@/lib/forestal/reparto-por-distribuir";
import type { RepartoServidor } from "./use-reparto-servidor";

const almacen = () => (typeof window === "undefined" ? null : window.localStorage);

/**
 * El nombre del bloque «Sin marcar», guardado junto a las casillas «Distribuido»
 * (misma hoja, misma clave base). Se lee tras montar: el servidor no ve localStorage.
 * Con `reparto`, además se guarda por negocio en el servidor y manda lo de allá.
 */
export function useNombreSinMarcar(clave: string, reparto?: RepartoServidor): [string, (nuevo: string) => void] {
  const [nombre, setNombre] = useState(NOMBRE_SIN_MARCAR);
  useEffect(() => {
    setNombre(leerNombreSinMarcar(almacen(), clave));
  }, [clave]);

  /* Lo del servidor (o lo que esta persona acaba de escribir y está por salir). */
  const conocido = reparto?.estado != null;
  const remoto = reparto?.estado?.nombreSinMarcar?.valor ?? NOMBRE_SIN_MARCAR;
  useEffect(() => {
    if (!conocido) return;
    setNombre(guardarNombreSinMarcar(almacen(), clave, normalizarNombreSinMarcar(remoto)));
  }, [conocido, remoto, clave]);

  const encolar = reparto?.encolar;
  const cambiar = useCallback(
    (nuevo: string) => {
      const limpio = guardarNombreSinMarcar(almacen(), clave, nuevo);
      setNombre(limpio);
      encolar?.({ nombreSinMarcar: { valor: limpio, at: Date.now() } });
    },
    [clave, encolar],
  );
  return [nombre, cambiar];
}
