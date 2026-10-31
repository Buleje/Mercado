"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "@buleje/design-system/icons";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";

/**
 * Elige VARIAS imágenes del Archivo (drive) para escanearlas. Lista los
 * documentos de tipo imagen y trae sus blobs por el proxy `/raw?download=1`.
 */
export function SelectorDrive({
  onVolver,
  onElegir,
}: {
  onVolver: () => void;
  onElegir: (blobs: Blob[]) => void;
}) {
  const [docs, setDocs] = useState<DbDocument[] | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [trayendo, setTrayendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/documents?limit=200", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { documents: DbDocument[] }) => {
        if (vivo) setDocs(d.documents.filter((x) => x.mimeType.startsWith("image/")));
      })
      .catch((err) => {
        logger.warn("[escaner] no se pudo listar el drive", { error: String(err) });
        if (vivo) {
          setError("No pudimos cargar tus imágenes.");
          setDocs([]);
        }
      });
    return () => {
      vivo = false;
    };
  }, []);

  const alternar = (id: string) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const importar = async () => {
    if (elegidos.size === 0) return;
    setTrayendo(true);
    setError(null);
    try {
      const blobs = await Promise.all(
        [...elegidos].map(async (id) => {
          const r = await fetch(`/api/admin/documents/${id}/raw?download=1`, { credentials: "same-origin" });
          if (!r.ok) throw new Error(`doc ${id} respondió ${r.status}`);
          return r.blob();
        }),
      );
      onElegir(blobs);
    } catch (err) {
      logger.warn("[escaner] import del drive falló", { error: String(err) });
      setError("No pudimos traer alguna imagen. Intenta de nuevo.");
    } finally {
      setTrayendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onVolver}
        className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>

      {docs === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /> Cargando tus imágenes…
        </div>
      ) : docs.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-secondary)]">No hay imágenes en tu Archivo todavía.</p>
      ) : (
        <div className="grid max-h-[48vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {docs.map((d) => {
            const sel = elegidos.has(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => alternar(d.id)}
                className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 bg-[var(--surface-sunken)] ${
                  sel ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
                }`}
                aria-pressed={sel}
                title={d.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/documents/${d.id}/raw`} alt={d.name} className="h-full w-full object-cover" loading="lazy" />
                {sel && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}

      <button
        type="button"
        onClick={importar}
        disabled={elegidos.size === 0 || trayendo}
        className="inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
      >
        {trayendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Importar {elegidos.size > 0 ? `(${elegidos.size})` : ""}
      </button>
    </div>
  );
}
