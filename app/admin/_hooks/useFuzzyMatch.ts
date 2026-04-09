"use client";

/**
 * app/admin/_hooks/useFuzzyMatch.ts
 *
 * Helper de fuzzy matching (subsecuencia, insensible a acentos y
 * mayúsculas) usado por la búsqueda del sidebar y por
 * `useAdminTabsDerived`. Extraído de app/admin/page.tsx en el Sprint A
 * final del refactor.
 */

import { useCallback } from "react";

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function useFuzzyMatch(): (text: string, query: string) => boolean {
  return useCallback((text: string, query: string) => {
    const nt = normalize(text);
    const nq = normalize(query);
    let qi = 0;
    for (let i = 0; i < nt.length && qi < nq.length; i++) {
      if (nt[i] === nq[qi]) qi++;
    }
    return qi === nq.length;
  }, []);
}
