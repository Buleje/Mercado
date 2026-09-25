"use client";

/**
 * CtpFotosDelIngreso — las fotos de la madera que bajó del camión.
 *
 * Por qué existe: el libro guarda hasta 10 fotos por ingreso desde hace rato
 * —la API las acepta (`wood-entries/route.ts`) y la ficha las pinta
 * (`CtpEntryDetailModal`)— pero el formulario mandaba `photos: null` fijo, así
 * que las **24 de 24 guías del tenant real están sin una sola foto**. No era una
 * decisión: faltaba la pieza de UI.
 *
 * Para qué sirven: ante una fiscalización, la foto del rollizo con su
 * codificación es lo que sostiene lo que dice el papel; y puertas adentro, es
 * cómo se discute un faltante con el proveedor sin tener que ir a mirar la pila.
 *
 * La foto se saca DONDE está la madera, así que en el celular abre la cámara
 * directamente (`capture="environment"`). Sube por el mismo camino que el resto
 * del panel (`/api/upload` + `compressIfLarge`, que además convierte el HEIC de
 * iPhone, que el servidor rechaza).
 */

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { compressIfLarge } from "@/lib/image-upload-utils";

/** Lo que acepta el libro por ingreso (`photos: z.array(...).max(10)`). */
export const MAX_FOTOS = 10;

export default function CtpFotosDelIngreso({
  fotos,
  onCambio,
  disabled,
}: {
  fotos: string[];
  onCambio: (urls: string[]) => void;
  disabled?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(0);
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const lugar = MAX_FOTOS - fotos.length;

  const subir = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    /* Se toman sólo las que entran: subir 12 y perder 2 en silencio sería peor
       que decir de entrada cuántas caben. */
    const elegidas = [...lista].slice(0, lugar);
    if (lista.length > elegidas.length) {
      toast.warning(`Entran ${lugar} foto${lugar === 1 ? "" : "s"} más: se suben las primeras.`);
    }
    setSubiendo(elegidas.length);
    const subidas: string[] = [];
    for (const archivo of elegidas) {
      try {
        const fd = new FormData();
        fd.append("file", await compressIfLarge(archivo));
        fd.append("folder", "forestal");
        const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
        const data = await leerJson<{ url?: string; error?: string }>(res);
        if (!res.ok || !data?.url) {
          toast.error(data?.error ?? `No se pudo subir ${archivo.name}.`);
          continue;
        }
        subidas.push(data.url);
      } catch {
        toast.error(`No se pudo subir ${archivo.name}. Revisa la conexión.`);
      }
    }
    setSubiendo(0);
    if (subidas.length > 0) onCambio([...fotos, ...subidas]);
    /* Sin esto, elegir la MISMA foto dos veces seguidas no dispara `change`. */
    if (archivoRef.current) archivoRef.current.value = "";
    if (camaraRef.current) camaraRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={archivoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => void subir(e.target.files)}
        />
        {/* En el celular esta abre la cámara; en la computadora, el explorador. */}
        <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void subir(e.target.files)} />
        <button
          type="button"
          onClick={() => camaraRef.current?.click()}
          disabled={disabled || lugar === 0 || subiendo > 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
        >
          <Camera className="h-4 w-4" aria-hidden /> Tomar foto
        </button>
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={disabled || lugar === 0 || subiendo > 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {subiendo > 0 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
          {subiendo > 0 ? `Subiendo ${subiendo}…` : "Agregar fotos"}
        </button>
        <span className="text-xs text-[var(--text-tertiary)]">
          {fotos.length === 0
            ? `Hasta ${MAX_FOTOS}. La foto del rollizo con su codificación es lo que sostiene el papel.`
            : `${fotos.length} de ${MAX_FOTOS}`}
        </span>
      </div>

      {fotos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {fotos.map((url, i) => (
            <li key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- subida del tenant, sin dominio fijo */}
              <img src={url} alt={`Foto ${i + 1} del ingreso`} className="h-20 w-20 rounded-lg border border-[var(--rule-base)] object-cover" />
              <button
                type="button"
                onClick={() => onCambio(fotos.filter((u) => u !== url))}
                disabled={disabled}
                aria-label={`Quitar la foto ${i + 1}`}
                className="absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)] transition-colors hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
