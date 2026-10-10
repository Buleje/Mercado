"use client";

/**
 * La forma de anotar el diámetro («D1 y D2 promediados» o «Varias medidas por
 * diámetro»), fijada en el equipo.
 *
 * UNA clave para Tala y Trozado, no una por sección: la forma depende de la
 * libreta de la cuadrilla —quién mide y con qué—, y la misma cuadrilla tumba y
 * troza el mismo árbol. Elegida en una sección, la otra ya abre igual (Brandon
 * 28-09: «fijarlas, también en general»).
 *
 * Una línea guardada «promediados» se abre así aunque el equipo tenga la otra:
 * mostrada como cruzadas, su Ø promedio pasaría por una medida tomada.
 */

import { useCallback, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { esFormaMedicion, FORMA_MEDICION_POR_DEFECTO, type FormaMedicion } from "@/lib/forestal/loth-forma-medicion";

export const CLAVE_FORMA_MEDICION = "loth-medicion-forma";

export function useFormaMedicion(deLaLinea: FormaMedicion | null = null): [FormaMedicion, (f: FormaMedicion) => void] {
  const [guardada, setGuardada] = useLocalStorage<FormaMedicion>(CLAVE_FORMA_MEDICION, FORMA_MEDICION_POR_DEFECTO);
  /** La de la línea de la que se parte manda hasta que se elija otra. */
  const [propia, setPropia] = useState<FormaMedicion | null>(deLaLinea);
  const forma = propia ?? (esFormaMedicion(guardada) ? guardada : FORMA_MEDICION_POR_DEFECTO);
  const elegir = useCallback(
    (f: FormaMedicion) => {
      setPropia(null);
      setGuardada(f);
    },
    [setGuardada],
  );
  return [forma, elegir];
}
