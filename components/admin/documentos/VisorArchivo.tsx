"use client";

/**
 * VisorArchivo — el PDF y la imagen del drive, con el error a la vista.
 *
 * EL BUG QUE ARREGLA: la vista previa apuntaba el `<iframe>` (y el `<img>`)
 * directo al endpoint del archivo. Cuando el servidor contestaba un 429, el
 * navegador recibía un JSON y lo dibujaba como texto plano DENTRO del visor:
 * el usuario veía `{"error":"Too many requests",...}` en lugar de su documento,
 * sin saber que era temporal ni cuándo reintentar.
 *
 * Acá el archivo se pide con `fetch` —que sí puede mirar el status— y recién
 * cuando llegaron los bytes se arma un blob para el visor. Si algo falla, se
 * muestra el aviso con su cuenta regresiva.
 *
 * Los archivos muy grandes siguen yendo directo al `<iframe>`: cargar 80 MB en
 * memoria para poder leer un status no es un buen negocio, y el visor de PDF
 * del navegador los muestra de a pedazos.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { pedirArchivo } from "@/lib/documentos/archivo-remoto";
import AvisoArchivo from "./AvisoArchivo";

/** Arriba de esto se prefiere el streaming del navegador al blob en memoria. */
const MAX_BLOB = 40 * 1024 * 1024;

/** Trae el archivo a un blob URL. `null` mientras carga; lanza al fallar. */
function useBlobDelArchivo(url: string, activo: boolean, intento: number) {
  const [blob, setBlob] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let creada: string | null = null;
    setBlob(null);
    setError(null);
    (async () => {
      try {
        const res = await pedirArchivo(url);
        const datos = await res.blob();
        if (!vivo) return;
        creada = URL.createObjectURL(datos);
        setBlob(creada);
      } catch (e) {
        if (vivo) setError(e);
      }
    })();
    return () => {
      vivo = false;
      // Sin esto, pasar por 200 documentos con las flechas deja 200 blobs
      // colgados en memoria hasta recargar la pestaña.
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [url, activo, intento]);

  return { blob, error };
}

export function VisorPdf({ url, nombre, tamano }: { url: string; nombre: string; tamano: number }) {
  const [intento, setIntento] = useState(0);
  const porBlob = tamano <= MAX_BLOB;
  const { blob, error } = useBlobDelArchivo(url, porBlob, intento);

  if (!porBlob) {
    return <iframe src={url} title={nombre} className={MARCO} />;
  }
  if (error) {
    return (
      <AvisoArchivo
        error={error}
        titulo="No se pudo mostrar el PDF"
        sugerencia="También podés descargarlo y abrirlo en tu equipo."
        urlDescarga={url}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }
  if (!blob) {
    return (
      <div className="flex h-[78vh] w-full items-center justify-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Abriendo el documento…
      </div>
    );
  }
  return <iframe src={blob} title={nombre} className={MARCO} />;
}

export function VisorImagen({ url, nombre }: { url: string; nombre: string }) {
  const [intento, setIntento] = useState(0);
  const { blob, error } = useBlobDelArchivo(url, true, intento);

  if (error) {
    return (
      <AvisoArchivo
        error={error}
        titulo="No se pudo mostrar la imagen"
        urlDescarga={url}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }
  if (!blob) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Abriendo la imagen…
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- blob local, no pasa por el optimizador
  return <img src={blob} alt={nombre} className="max-h-full max-w-full rounded-lg object-contain shadow-md" />;
}

const MARCO = "w-full h-[78vh] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]";
