"use client";

import { useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import {
  sugerirEsenciales, vencimientosEncontrados, type CarpetaEsencial, type UsoDoc,
} from "@/lib/documentos/esenciales";
import type { ModeloArchivo } from "../archivo/use-archivo";
import LeerPapeles from "./LeerPapeles";
import SugerenciasEsenciales from "./SugerenciasEsenciales";
import VencimientosEncontrados from "./VencimientosEncontrados";
import { marcarEsenciales } from "./marcar-esencial";

/**
 * Lo que Esenciales te pide resolver, arriba de las tarjetas (Brandon 23-10):
 * las fechas de vencimiento que la lectura encontró, «leer todo lo que falta»
 * de una vez, y las carpetas que abres seguido. Sin carpetas esenciales, sólo
 * las sugerencias (para arrancar).
 */
export default function AvisosEsenciales({ arch, todas, vivos, uso, abrir, soloSugerencias = false }: {
  arch: ModeloArchivo;
  todas: readonly CarpetaEsencial<DbDocumentFolder>[];
  vivos: readonly DbDocument[];
  uso: Record<string, UsoDoc>;
  abrir: (doc: DbDocument, lista: readonly DbDocument[]) => void;
  soloSugerencias?: boolean;
}) {
  const { folders, bulkFolders, aplicarSugerencia, descartarSugerencia, sugDescartadas } = arch;
  const [fuera, setFuera] = useLocalStorage<string[]>("documentos-esenciales-sugerencias-fuera", []);

  const sugeridas = useMemo(
    () => sugerirEsenciales({ carpetas: folders, docs: vivos, uso, descartadas: fuera }),
    [folders, vivos, uso, fuera],
  );
  // Los papeles de TODAS las esenciales (con sus subcarpetas).
  const deEsenciales = useMemo(() => {
    const ids = new Set(todas.flatMap((e) => [...e.carpetaIds]));
    return vivos.filter((d) => !!d.folderId && ids.has(d.folderId));
  }, [todas, vivos]);
  const fechas = useMemo(() => vencimientosEncontrados(deEsenciales, sugDescartadas), [deEsenciales, sugDescartadas]);

  const filaSugeridas = (
    <SugerenciasEsenciales
      sugerencias={sugeridas}
      onSumar={(f) => void marcarEsenciales(bulkFolders, [f], true)}
      onDescartar={(id) => setFuera([...fuera, id])}
    />
  );
  if (soloSugerencias) return filaSugeridas;

  return (
    <>
      <VencimientosEncontrados
        items={fechas}
        onConfirmar={(id, fecha) => aplicarSugerencia(id, { expiresAt: fecha })}
        onDescartar={descartarSugerencia}
        onAbrir={(doc) => abrir(doc, fechas.map((x) => x.doc))}
      />
      {/* Cada uno en su fila: juntos, las sugerencias se partían en dos a 1280. */}
      <LeerPapeles docs={deEsenciales} arch={arch} />
      {filaSugeridas}
    </>
  );
}
