"use client";

/**
 * Vista previa de una presentación (.pptx / .odp) sin abrir PowerPoint.
 *
 * No renderiza las diapositivas —eso pide una máquina de layout entera— pero sí
 * muestra el guion: título y viñetas de cada una, numeradas. Es lo que hace
 * falta para reconocer la presentación, encontrar una diapositiva y decidir si
 * es la que se buscaba. Antes era un ícono naranja y "sin vista previa".
 */

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Presentation } from "@buleje/design-system/icons";
import { leerPresentacion, type Diapositiva } from "@/lib/documentos/presentacion";

export default function PresentacionPreview({ url, nombre }: { url: string; nombre: string }) {
  const [diapos, setDiapos] = useState<Diapositiva[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        // jszip entra por dynamic import: sólo pesa cuando se abre una presentación.
        const [{ default: JSZip }, res] = await Promise.all([import("jszip"), fetch(url, { credentials: "include" })]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const zip = await JSZip.loadAsync(await res.arrayBuffer());
        const d = await leerPresentacion(zip, nombre);
        if (vigente) setDiapos(d);
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { vigente = false; };
  }, [url, nombre]);

  if (error) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
        <AlertCircle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" />
        No se pudo leer la presentación ({error}). Descargala para abrirla.
      </p>
    );
  }

  if (!diapos) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo la presentación…
      </p>
    );
  }

  if (diapos.length === 0) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
        <AlertCircle className="h-4 w-4 shrink-0" /> La presentación no tiene texto para mostrar.
      </p>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        <Presentation className="h-4 w-4" />
        {diapos.length} diapositiva{diapos.length === 1 ? "" : "s"}
      </p>
      <ol className="space-y-3">
        {diapos.map((d) => (
          <li
            key={d.numero}
            className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
          >
            <div className="flex items-start gap-3">
              {/* El número grande hace de "miniatura": ubica sin renderizar. */}
              <span className="shrink-0 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-[var(--text-tertiary)]">
                {d.numero}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-[var(--text-primary)]">
                  {d.titulo || <span className="italic text-[var(--text-tertiary)]">Sin título</span>}
                </p>
                {d.lineas.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-sm text-[var(--text-secondary)]">
                    {d.lineas.map((l, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-[var(--text-tertiary)]">·</span>
                        <span className="min-w-0">{l}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
