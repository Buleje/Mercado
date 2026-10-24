import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { isAnalyzableMime } from "@/lib/documents/analyzable-mime";
import { esFotoDeMaquina } from "@/lib/documents/fotos-de-maquina";
import type { DbDocument } from "@/lib/types/documents";
import { analyzeDoc, fetchSharedLinks } from "@/hooks/use-documents";
import { mensajeDeError, type BuiltinCategory } from "./compartido";
import { repartirVencimientos } from "@/lib/documentos/vencimientos-aviso";
import { cuentaEnlacesGuardada, guardarCuentaEnlaces } from "@/lib/documentos/cache-lista-cliente";
import type { HastaArchivoLista } from "./use-archivo-lista";
export function useArchivoIndice(previo: HastaArchivoLista) {
  const { documents, setAvisoIA, refresh, indexableDocs, progresoDesc, setProgresoDesc, loading, otrosAbierto } = previo;
  // RE-indexar (que los viejos ganen la descripción rica nueva).
  const reindexableDocs = useMemo(
    () => documents.filter((d) => isAnalyzableMime(d.mimeType) && !esFotoDeMaquina(d)),
    [documents]
  );
  const runIndex = useCallback(
    async (list: DbDocument[], onProgress: (done: number, total: number) => void) => {
      onProgress(0, list.length);
      let done = 0;
      // Si no hay modelo de visión configurado, la 1ª foto lo revela: seguir
      // pidiendo por las otras 200 sería quemar tiempo para el mismo error.
      let sinVision = false;
      for (const d of list) {
        const esFoto = d.mimeType.startsWith("image/");
        if (!(sinVision && esFoto)) {
          const r = await analyzeDoc(d.id).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (esFoto && /vision_unavailable/.test(msg)) {
              sinVision = true;
              setAvisoIA(mensajeDeError(msg));
            }
            console.warn("[documentos] analyze fail", d.id, msg);
            return null;
          });
          // El servidor guardó el texto pero la IA no describió (sin cupo, sin
          // clave): seguir con los otros 200 da el mismo resultado. Se corta y
          // se dice por qué, en vez de terminar con el contador igual.
          if (r?.aviso) {
            setAvisoIA(r.aviso);
            break;
          }
        }
        done += 1;
        onProgress(done, list.length);
      }
      await refresh();
    },
    [refresh, setAvisoIA]
  );
  const handleIndexAll = useCallback(
    (onProgress: (done: number, total: number) => void) => runIndex(indexableDocs, onProgress),
    [indexableDocs, runIndex]
  );
  /** Describir de una vez todo lo que falta, sin irse al asistente. */
  const describirFaltantes = useCallback(async () => {
    if (progresoDesc || indexableDocs.length === 0) return;
    setProgresoDesc({ hechos: 0, total: indexableDocs.length });
    try {
      await runIndex(indexableDocs, (hechos, total) => setProgresoDesc({ hechos, total }));
    } finally {
      setTimeout(() => setProgresoDesc(null), 1200);
    }
  }, [indexableDocs, progresoDesc, runIndex, setProgresoDesc]);
  const handleReindexAll = useCallback(
    (onProgress: (done: number, total: number) => void) => runIndex(reindexableDocs, onProgress),
    [reindexableDocs, runIndex]
  );

  const totalSize = useMemo(() => documents.reduce((s, d) => s + d.size, 0), [documents]);
  const favCount = useMemo(() => documents.filter((d) => d.favorite).length, [documents]);
  // Vencimientos partidos: lo que YA venció (rojo) y lo que vence en 30 días
  // (coral, incluye «vence hoy»). Sin los de la papelera: en esa vista
  // `documents` son los borrados y el aviso decía «3 por vencer» de archivos
  // tirados, mientras «Ver» llevaba a los 5 vivos (11-10).
  const repartidos = useMemo(() => repartirVencimientos(documents, 30), [documents]);
  const vencidosDocs = repartidos.vencidos;
  const expiringDocs = repartidos.porVencer;
  const expiringSoonCount = vencidosDocs.length + expiringDocs.length;
  // Evita el parpadeo a "0" del contador al cambiar de carpeta: mientras carga,
  // retiene el último conteo estable en vez de mostrar 0.
  const lastDocCount = useRef(0);
  useEffect(() => { if (!loading) lastDocCount.current = documents.length; }, [loading, documents.length]);

  // ── Vista del sidebar: ocultar las que no tienen nada adentro (Brandon
  // 2026-08-30) — "Resumen"/"Asistente IA"/"Recientes"/"Actividad" no aportan
  // nada con cero documentos; "Calendario" sin vencimientos cargados tampoco.
  const anyExpiryCount = useMemo(() => documents.filter((d) => d.expiresAt).length, [documents]);
  /** Mismo criterio que `DocumentsDB.gruposDuplicados` (backend): agrupar por
   * tamaño + nombre-base evita pedir `/documents/duplicates` sólo para saber
   * si hay que mostrar "Repetidos" — los documentos ya están en memoria. */
  const hayDuplicados = useMemo(() => {
    const nombreBase = (n: string) =>
      n.toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[ _-]*\(\d+\)$/, "")
        .replace(/[ _-]*(copia|copy)\s*\d*$/, "")
        .trim();
    const porClave = new Map<string, number>();
    for (const d of documents) {
      if (d.size < 1024) continue;
      const clave = `${d.size}:${nombreBase(d.name)}`;
      porClave.set(clave, (porClave.get(clave) ?? 0) + 1);
    }
    return Array.from(porClave.values()).some((n) => n > 1);
  }, [documents]);
  // Enlaces compartidos SÍ necesita una request propia: a diferencia de
  // duplicados, no se puede derivar de `documents` (una carpeta compartida no
  // deja rastro en ningún documento individual). `null` = todavía no se sabe
  // → no ocultar (más vale mostrar de más que esconder algo que sí tiene datos).
  // Sólo decide si «Enlaces» se ve en «Más vistas»: se pide al abrir ese grupo (22-10).
  const [enlacesCount, setEnlacesCount] = useState<number | null>(() => cuentaEnlacesGuardada());
  useEffect(() => {
    if (!otrosAbierto || cuentaEnlacesGuardada() !== null) return;
    fetchSharedLinks()
      .then((links) => { guardarCuentaEnlaces(links.length); setEnlacesCount(links.length); })
      .catch((err) => { console.warn("[documentos] no pude contar los enlaces compartidos", err); setEnlacesCount(null); });
  }, [otrosAbierto]);
  const vistaConDatos = useMemo(() => ({
    all: true,
    // Siempre a la vista: vacía explica cómo vincular una carpeta (clic derecho).
    terceros: true,
    dashboard: documents.length > 0,
    assistant: documents.length > 0,
    favorites: favCount > 0,
    recent: documents.length > 0,
    expiring: expiringSoonCount > 0,
    calendar: anyExpiryCount > 0,
    activity: documents.length > 0,
    enlaces: enlacesCount === null || enlacesCount > 0,
    duplicados: hayDuplicados,
    sync: true,
    trash: true,
  }) as Record<BuiltinCategory["id"], boolean>, [documents.length, favCount, expiringSoonCount, anyExpiryCount, enlacesCount, hayDuplicados]);
  const shownDocCount = loading && documents.length === 0 ? lastDocCount.current : documents.length;

  // ── Árbol de carpetas (subcarpetas anidadas) ──
  return { reindexableDocs, runIndex, handleIndexAll, describirFaltantes, handleReindexAll, totalSize,
    favCount, repartidos, vencidosDocs, expiringDocs, expiringSoonCount, lastDocCount, anyExpiryCount,
    hayDuplicados, enlacesCount, setEnlacesCount, vistaConDatos, shownDocCount };
}
export type HastaArchivoIndice = HastaArchivoLista & ReturnType<typeof useArchivoIndice>;