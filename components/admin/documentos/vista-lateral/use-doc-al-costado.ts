"use client";

/**
 * Un papel mostrado en la columna derecha de Esenciales o Terceros (Brandon
 * 31-10: el mismo «un clic = ver al costado» del Archivo). Recuerda cuál y por
 * qué lista pasan ‹ ›; queda atado a `clave` (la carpeta o el tercero elegido):
 * elegir otro vuelve a la lista sin arrastrar el papel de antes.
 *
 * El papel se resuelve contra la lista viva de documentos: renombrado o movido
 * desde el panel, se ve al instante; borrado, el panel vuelve a la lista.
 */

import { useCallback, useMemo, useState } from "react";
import type { DbDocument } from "@/lib/types/documents";
import type { NavPrevia } from "./PreviaDoc";

export function useDocAlCostado(documentos: readonly DbDocument[], clave: string | null) {
  const [estado, setEstado] = useState<{ clave: string | null; id: string; lista: string[] } | null>(null);
  const porId = useMemo(() => new Map(documentos.map((d) => [d.id, d])), [documentos]);

  const vigente = estado && estado.clave === clave ? estado : null;
  const doc = vigente ? porId.get(vigente.id) ?? null : null;
  const lista = vigente ? vigente.lista.filter((id) => porId.has(id)) : [];
  const i = doc ? lista.indexOf(doc.id) : -1;

  const abrir = useCallback(
    (d: DbDocument, de?: readonly DbDocument[]) => setEstado({ clave, id: d.id, lista: (de && de.length > 0 ? de : [d]).map((x) => x.id) }),
    [clave],
  );
  const cerrar = useCallback(() => setEstado(null), []);
  const ir = (id: string) => setEstado((e) => (e ? { ...e, id } : e));

  const nav = (volver: string): NavPrevia => ({
    anterior: i > 0 ? () => ir(lista[i - 1]) : undefined,
    siguiente: i >= 0 && i < lista.length - 1 ? () => ir(lista[i + 1]) : undefined,
    posicion: i >= 0 ? { actual: i + 1, total: lista.length } : null,
    onCerrar: cerrar,
    cerrarTitulo: volver,
    volver,
  });

  return { doc, abrir, cerrar, nav };
}
