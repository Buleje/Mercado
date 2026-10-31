/**
 * La pila de «Armar escaneando» guardada en ESTE equipo (2026-09-26).
 *
 * En el patio la tablet se bloquea, se recarga o se cae la señal a mitad de
 * una pila de 30 trozas: volver a pasar la pistola por todas es lo que hace
 * que se deje de usar. Se guardan sólo los ids —la pieza se vuelve a leer del
 * patio al montar— y por tenant, para que una tablet compartida entre dos
 * operaciones hermanas no mezcle pilas.
 *
 * Qué ids siguen valiendo lo decide la pantalla, que tiene el patio: acá sólo
 * se guarda y se lee.
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

function claveDeLaPila(): string {
  let slug = "main";
  try {
    slug = window.localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* modo privado o sin storage: la pila vive sólo en memoria */
  }
  return `ctp-pila-escaneada:${slug}`;
}

function leerPila(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo: unknown = JSON.parse(window.localStorage.getItem(claveDeLaPila()) ?? "[]");
    return Array.isArray(crudo)
      ? crudo.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
  } catch {
    return [];
  }
}

function escribirPila(ids: readonly string[]) {
  try {
    if (ids.length === 0) window.localStorage.removeItem(claveDeLaPila());
    else window.localStorage.setItem(claveDeLaPila(), JSON.stringify(ids));
  } catch {
    /* sin storage (lleno o privado): se sigue armando, sólo no sobrevive un recargo */
  }
}

/**
 * Los ids de la pila, la última escaneada primero. `inicial` entra ARRIBA de lo
 * guardado (sin repetir): la troza desde cuya ficha se abrió es la que se acaba
 * de tocar.
 */
export function usePilaEscaneada(
  inicial?: readonly string[],
): [string[], Dispatch<SetStateAction<string[]>>] {
  const [pila, setPila] = useState<string[]>(() => {
    const guardada = leerPila();
    const nuevas = (inicial ?? []).filter((id) => !guardada.includes(id));
    return [...nuevas, ...guardada];
  });
  useEffect(() => {
    escribirPila(pila);
  }, [pila]);
  return [pila, setPila];
}
