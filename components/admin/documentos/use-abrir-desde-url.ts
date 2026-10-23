"use client";

/**
 * El Archivo se abre ya apuntando a algo, por la URL:
 *
 *  - `?doc=<id>`: abre la vista previa de ese papel (lo usa el buscador del
 *    panel, «Buscar papeles desde cualquier lado»). Si el papel no está en la
 *    lista cargada (una foto escondida, otra carpeta) se pide por id. Si ya no
 *    existe o no se puede ver: aviso suave y la URL queda limpia. Al cerrar la
 *    vista previa, `doc` sale de la URL (`useFichaEnUrl`: «atrás» o
 *    `replaceState`, según cómo se llegó).
 *  - `?q=<texto>`: pone ese texto en el buscador del Archivo. Se lee una vez y
 *    se borra de la URL: es una orden, no un estado (el buscador ya tiene el suyo).
 *
 * Salió de `DocumentosModule.tsx` (3.700 líneas) para tocarlo con una sola llamada.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { MARCA_FICHA_DESDE } from "@/components/admin/shared/ir-a-enlace";
import type { DbDocument } from "@/lib/types/documents";

const AVISO_NO_DISPONIBLE = "Ese papel ya no está o no tienes acceso";

interface Opciones {
  /** La lista que el Archivo ya cargó (se prefiere a pedir el papel por id). */
  documents: readonly DbDocument[];
  /** La lista todavía se está cargando: no se pide por id hasta saber que ahí no está. */
  loading: boolean;
  preview: DbDocument | null;
  setPreview: (doc: DbDocument | null) => void;
  /** Pone texto en el buscador del Archivo. */
  setBuscar: (texto: string) => void;
}

/** `?q=` de la URL, borrándolo en el mismo gesto (sin tocar el historial). */
function consumirQDeLaUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q")?.trim();
    if (!q) return null;
    url.searchParams.delete("q");
    /* NO pasar `window.history.state` tal cual: trae la marca `__NA` de Next, que entonces
       no sincroniza su router y su HistoryUpdater vuelve a escribir la URL vieja (con `q`).
       Sólo se conserva lo nuestro: la marca de la ficha (ver `useFichaEnUrl`). */
    const estado: unknown = window.history.state;
    const desde = estado && typeof estado === "object" ? (estado as Record<string, unknown>)[MARCA_FICHA_DESDE] : null;
    window.history.replaceState(typeof desde === "string" ? { [MARCA_FICHA_DESDE]: desde } : null, "", url.toString());
    return q;
  } catch {
    return null;
  }
}

export function useAbrirDesdeUrl({ documents, loading, preview, setPreview, setBuscar }: Opciones): void {
  const ficha = useFichaEnUrl("doc");
  const idUrl = ficha.id;

  /* Lo último que el efecto de la URL ya atendió (abrió o descartó): sólo reacciona a un id NUEVO. */
  const atendidoRef = useRef<string | null>(null);
  /* Hay un pedido por id en vuelo: la lista que cambia no lo repite (cada pedido deja un «visto» en la bitácora). */
  const enVueloRef = useRef<string | null>(null);
  /* La vista previa abierta la pidió la URL: al cerrarla hay que sacar `doc`. */
  const abiertoPorUrlRef = useRef(false);
  const previoRef = useRef<DbDocument | null>(null);
  const idUrlRef = useRef(idUrl);
  idUrlRef.current = idUrl;
  const fichaRef = useRef(ficha);
  fichaRef.current = ficha;

  /* URL → vista previa. */
  useEffect(() => {
    if (!idUrl) {
      atendidoRef.current = null;
      /* «Atrás» del navegador con el papel abierto: la vista previa se cierra con él. */
      if (abiertoPorUrlRef.current) {
        abiertoPorUrlRef.current = false;
        setPreview(null);
      }
      return;
    }
    if (idUrl === atendidoRef.current || idUrl === enVueloRef.current) return;

    const enLista = documents.find((d) => d.id === idUrl);
    if (enLista) {
      atendidoRef.current = idUrl;
      abiertoPorUrlRef.current = true;
      setPreview(enLista);
      return;
    }
    if (loading) return; // todavía no se sabe si está en la lista

    enVueloRef.current = idUrl;
    fetch(`/api/admin/documents/${encodeURIComponent(idUrl)}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { document?: DbDocument };
        if (!json.document) throw new Error("sin documento");
        return json.document;
      })
      .then((doc) => {
        enVueloRef.current = null;
        /* La persona ya cambió de papel o cerró: no abrir uno viejo. */
        if (idUrlRef.current !== idUrl) return;
        atendidoRef.current = idUrl;
        abiertoPorUrlRef.current = true;
        setPreview(doc);
      })
      .catch((err: unknown) => {
        enVueloRef.current = null;
        logger.warn("[archivo] ?doc= no se pudo abrir", { id: idUrl, error: String(err) });
        if (idUrlRef.current !== idUrl) return;
        atendidoRef.current = idUrl;
        toast.info(AVISO_NO_DISPONIBLE, { id: "archivo-papel-no-disponible" });
        fichaRef.current.cerrar();
      });
  }, [idUrl, documents, loading, setPreview]);

  /* Vista previa → URL (sólo si la abrió la URL). */
  useEffect(() => {
    const antes = previoRef.current;
    previoRef.current = preview;
    if (!antes || !abiertoPorUrlRef.current) return;
    if (!preview) {
      abiertoPorUrlRef.current = false;
      fichaRef.current.cerrar();
    } else if (preview.id !== antes.id) {
      /* Anterior/siguiente dentro de la vista previa: la URL sigue al papel que se ve. */
      atendidoRef.current = preview.id;
      fichaRef.current.abrir(preview.id);
    }
  }, [preview]);

  /* `?q=`: al montar y cuando un enlace del panel lo trae con el Archivo ya abierto. */
  useEffect(() => {
    const aplicar = () => {
      const q = consumirQDeLaUrl();
      if (q) setBuscar(q);
    };
    aplicar();
    window.addEventListener("popstate", aplicar);
    return () => window.removeEventListener("popstate", aplicar);
  }, [setBuscar]);
}
