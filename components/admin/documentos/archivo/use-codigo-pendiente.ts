import { useEffect, useMemo, useState } from "react";
import { fetchConteoCodigoPendiente } from "@/hooks/use-documents";
import { codigoFisicoPendiente } from "@/lib/documentos/codigo-documento";
import type { DbDocument } from "@/lib/types/documents";

export interface ConteoCodigoPendiente {
  /** Papeles con código que todavía no se anotó en el físico (todo el Archivo, no la carpeta abierta). */
  pendientes: number;
  /** De esos, los que ya pasaron el plazo del aviso de la campana. */
  atrasados: number;
}

/**
 * ADR-516 — La cifra de «Por registrar» de la cabecera. La cuenta el
 * servidor (la lista a la vista puede ser una sola carpeta) y se vuelve a pedir
 * cuando la lista cambia lo que sabe de los códigos: subir, borrar o marcar.
 * `null` = todavía no se sabe (no se dibuja nada).
 */
export function useConteoCodigoPendiente(documents: DbDocument[]): ConteoCodigoPendiente | null {
  const [conteo, setConteo] = useState<ConteoCodigoPendiente | null>(null);
  const huella = useMemo(() => {
    let pendientes = 0;
    for (const d of documents) if (codigoFisicoPendiente(d)) pendientes += 1;
    return `${documents.length}:${pendientes}`;
  }, [documents]);
  useEffect(() => {
    let vivo = true;
    // Un respiro: marcar 30 de una cambia la huella 30 veces en un instante.
    const t = setTimeout(() => {
      fetchConteoCodigoPendiente()
        .then((c) => { if (vivo) setConteo(c); })
        .catch((err) => console.warn("[documentos] no pude contar los códigos por registrar", err));
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [huella]);
  return conteo;
}
