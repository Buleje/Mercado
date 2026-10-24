import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { isAnalyzableMime } from "@/lib/documents/analyzable-mime";
import { TAGS_FOTOS_DE_MAQUINA } from "@/lib/documents/fotos-de-maquina";
import { estaSinOrdenar } from "@/lib/documentos/sugerir-carpeta-texto";
import type { CarpetaCandidata } from "@/lib/documentos/sugerir-carpeta";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { SugerenciaIA } from "../AvisosDelArchivo";
import { slugActivo } from "./compartido";

/**
 * «Foto que se archiva sola» (Brandon 24-10): los papeles que acabas de subir
 * o escanear y quedaron sueltos (raíz, «Otros», «Llegó por WhatsApp › fecha»)
 * preguntan «¿Va a "X"?». Si todavía se están leyendo, vuelve a preguntar
 * cada 5 s hasta 3 min; si la lectura llega después, el aviso sale en la
 * próxima carga mientras el papel siga suelto (24 h). Nunca mueve solo.
 */

const RECIENTE_MS = 24 * 60 * 60_000;
const ESPERA_MS = 3 * 60_000;
const CADA_MS = 5_000;
const MAX_PAPELES = 8;
const MAX_DESCARTADAS = 500;
const claveNo = () => `doc-propuesta-no-${slugActivo()}`;

interface Respuesta {
  leido: boolean;
  candidatas: CarpetaCandidata[];
}
export interface Candidata extends CarpetaCandidata {
  nombre: string;
}
export interface PropuestaVisible {
  doc: DbDocument;
  candidatas: Candidata[];
}

const leidoEnGrilla = (d: DbDocument) => !!(d.ocrMetadata as { analyzedAt?: unknown } | null)?.analyzedAt;
const edad = (d: DbDocument) => Date.now() - Date.parse(d.uploadedAt);

interface Entrada {
  documents: DbDocument[];
  folders: DbDocumentFolder[];
  bulk: (action: "move", ids: string[], extra?: Record<string, unknown>) => Promise<number>;
  refresh: (opciones?: { silencioso?: boolean; soloDocumentos?: boolean }) => Promise<void>;
  /** En la papelera o con una búsqueda escrita no se propone nada. */
  activo: boolean;
}

export function usePropuestaCarpeta({ documents, folders, bulk, refresh, activo }: Entrada) {
  const [descartadas, setDescartadas] = useState<Set<string>>(() => new Set());
  const [respuestas, setRespuestas] = useState<ReadonlyMap<string, Respuesta>>(() => new Map());
  const [vuelta, setVuelta] = useState(0);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const porId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveNo());
      if (raw) setDescartadas(new Set(JSON.parse(raw) as string[]));
    } catch (err) {
      logger.warn("[documentos] propuestas descartadas ilegibles", { err: String(err) });
    }
  }, []);

  const descartar = useCallback((docId: string) => {
    setDescartadas((prev) => {
      const s = new Set(prev).add(docId);
      try {
        localStorage.setItem(claveNo(), JSON.stringify([...s].slice(-MAX_DESCARTADAS)));
      } catch (err) {
        logger.warn("[documentos] no pude recordar la propuesta descartada", { err: String(err) });
      }
      return s;
    });
  }, []);

  const sinOrdenar = useMemo(
    () => (!activo ? [] : documents
      .filter((d) => !descartadas.has(d.id) && isAnalyzableMime(d.mimeType) && edad(d) < RECIENTE_MS
        && !d.tags.some((t) => TAGS_FOTOS_DE_MAQUINA.includes(t)) && estaSinOrdenar(d.folderId, porId))
      .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
      .slice(0, MAX_PAPELES)),
    [activo, documents, descartadas, porId],
  );

  // Lo que falta preguntar: lo nuevo, y lo que seguía sin leer (con espera, de a 5 s).
  const { ids, esperar } = useMemo(() => {
    const falta = sinOrdenar.filter((d) => {
      const r = respuestas.get(d.id);
      return !r || (!r.leido && edad(d) < ESPERA_MS);
    });
    return { ids: falta.map((d) => d.id).join(","), esperar: falta.every((d) => respuestas.has(d.id)) };
  }, [sinOrdenar, respuestas]);

  useEffect(() => {
    if (!ids) return;
    let vivo = true;
    const lista = ids.split(",");
    const t = setTimeout(async () => {
      let propuestas: Record<string, Respuesta> = {};
      try {
        const res = await fetch(`/api/admin/documents/proponer-carpeta?ids=${lista.map(encodeURIComponent).join(",")}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        propuestas = ((await res.json()) as { propuestas?: Record<string, Respuesta> }).propuestas ?? {};
      } catch (err) {
        // Sin respuesta no se insiste: el aviso es una ayuda, no tiene que trabar nada.
        logger.warn("[documentos] propuesta de carpeta falló", { err: String(err) });
      }
      if (!vivo) return;
      setRespuestas((prev) => {
        const m = new Map(prev);
        for (const id of lista) m.set(id, propuestas[id] ?? { leido: true, candidatas: [] });
        return m;
      });
      setVuelta((v) => v + 1);
    }, esperar ? CADA_MS : 0);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [ids, esperar, vuelta]);

  // Cuando un papel que se estaba leyendo terminó, la grilla trae su nombre y su resumen nuevos.
  const sinLeer = useRef(new Set<string>());
  useEffect(() => {
    let llego = false;
    for (const [id, r] of respuestas) {
      if (!r.leido) sinLeer.current.add(id);
      else if (sinLeer.current.delete(id)) llego = true;
    }
    if (llego) {
      refresh({ silencioso: true, soloDocumentos: true })
        .catch((err) => logger.warn("[documentos] recarga tras leer falló", { err: String(err) }));
    }
  }, [respuestas, refresh]);

  const items = useMemo<PropuestaVisible[]>(
    () => sinOrdenar.flatMap((doc) => {
      const candidatas = (respuestas.get(doc.id)?.candidatas ?? []).flatMap((c) => {
        const f = porId.get(c.folderId);
        return f && c.folderId !== doc.folderId ? [{ ...c, nombre: f.name }] : [];
      });
      return candidatas.length ? [{ doc, candidatas }] : [];
    }),
    [sinOrdenar, respuestas, porId],
  );

  const leyendo = useMemo(
    () => sinOrdenar.filter((d) => !leidoEnGrilla(d) && !respuestas.get(d.id)?.leido && edad(d) < ESPERA_MS),
    [sinOrdenar, respuestas],
  );

  const mover = useCallback(async (doc: DbDocument, folderId: string) => {
    const destino = porId.get(folderId)?.name ?? "la carpeta";
    const antes = doc.folderId;
    setMoviendo(doc.id);
    try {
      const n = await bulk("move", [doc.id], { folderId });
      if (n === 0) {
        toast.error("No se pudo mover: ya no ves ese papel o esa carpeta.");
        return;
      }
      descartar(doc.id);
      toast.success(`«${doc.name}» ahora está en «${destino}»`, {
        action: {
          label: "Deshacer",
          onClick: () => {
            bulk("move", [doc.id], { folderId: antes }).catch((err) => {
              logger.warn("[documentos] deshacer mover falló", { err: String(err) });
              toast.error("No se pudo deshacer. Muévelo desde el menú del papel.");
            });
          },
        },
      });
    } catch (err) {
      logger.warn("[documentos] mover a la carpeta propuesta falló", { err: String(err) });
      toast.error("No se pudo mover. Inténtalo otra vez.");
    } finally {
      setMoviendo(null);
    }
  }, [bulk, descartar, porId]);

  return { items, leyendo, moviendo, mover, descartar };
}

export type PropuestaCarpetaModelo = ReturnType<typeof usePropuestaCarpeta>;

/**
 * La pastilla de la IA no repite la carpeta de un papel que ya pregunta
 * «¿Va a…?» (lo que la IA propuso ya suma en esa propuesta); su vencimiento sí queda.
 */
export function sinCarpetaRepetida(sugerencias: SugerenciaIA[], items: readonly PropuestaVisible[]): SugerenciaIA[] {
  const ya = new Set(items.map((i) => i.doc.id));
  return sugerencias.flatMap((s) => (!ya.has(s.doc.id) || !s.carpeta ? [s] : s.vence ? [{ ...s, carpeta: null }] : []));
}
