"use client";

/**
 * Las grabaciones guardadas en la carpeta del Archivo: cargar, guardar una
 * nueva, renombrar, editar (nombre, nota, recorte) y mandar a la papelera.
 * La carpeta se busca al abrir y se CREA recién al guardar la primera.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DbDocument } from "@/lib/types/documents";
import {
  borrarGrabacion,
  carpetaDeRuta,
  editarGrabacion,
  guardarGrabacion,
  listarGrabaciones,
  reemplazarAudio,
} from "@/lib/grabadora/archivo";

export interface Grabaciones {
  items: DbDocument[];
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  guardar: (o: { blob: Blob; nombre: string; nota?: string }) => Promise<DbDocument>;
  renombrar: (id: string, nombre: string) => Promise<void>;
  editar: (id: string, o: { nombre: string; nota: string; recorte?: File }) => Promise<void>;
  borrar: (id: string) => Promise<void>;
}

const texto = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useGrabaciones(carpeta: string): Grabaciones {
  const [items, setItems] = useState<DbDocument[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const folderId = useRef<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setCargando(true);
    setError(null);
    (async () => {
      const id = await carpetaDeRuta(carpeta, false, ac.signal);
      folderId.current = id;
      const lista = id ? await listarGrabaciones(id, ac.signal) : [];
      if (!ac.signal.aborted) setItems(lista);
    })()
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(texto(err));
      })
      .finally(() => {
        if (!ac.signal.aborted) setCargando(false);
      });
    return () => ac.abort(); // una carga vieja no pisa a la nueva
  }, [carpeta, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  const reemplazar = (doc: DbDocument) => setItems((xs) => xs.map((x) => (x.id === doc.id ? doc : x)));

  const guardar = useCallback<Grabaciones["guardar"]>(async (o) => {
    const id = folderId.current ?? (await carpetaDeRuta(carpeta, true));
    if (!id) throw new Error("No se pudo crear la carpeta en el Archivo.");
    folderId.current = id;
    const doc = await guardarGrabacion({ ...o, folderId: id });
    setItems((xs) => [doc, ...xs.filter((x) => x.id !== doc.id)]);
    return doc;
  }, [carpeta]);

  const renombrar = useCallback<Grabaciones["renombrar"]>(async (id, nombre) => {
    reemplazar(await editarGrabacion(id, { name: nombre }));
  }, []);

  const editar = useCallback<Grabaciones["editar"]>(async (id, o) => {
    if (o.recorte) await reemplazarAudio(id, o.recorte, "Recortada desde la grabadora");
    reemplazar(await editarGrabacion(id, { name: o.nombre, descripcion: o.nota }));
  }, []);

  const borrar = useCallback<Grabaciones["borrar"]>(async (id) => {
    await borrarGrabacion(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  return { items, cargando, error, recargar, guardar, renombrar, editar, borrar };
}
