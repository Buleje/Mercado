"use client";

/**
 * CtpParteAdjuntos — los papeles del titular, guardados donde se los va a buscar.
 *
 * El permiso, la resolución, la vigencia de poder, la copia del RUC: cuando
 * llega una fiscalización se piden junto con las guías, y hasta ahora vivían en
 * el correo de alguien. Acá se suben una vez y quedan colgados del titular.
 *
 * ── Qué se guarda acá y qué en el Drive ──────────────────────────────────────
 * El ARCHIVO va al Drive del negocio —con su versionado, su papelera y su
 * búsqueda—; en la parte queda sólo el puntero. Duplicar el binario en la fila
 * del directorio haría que el mismo permiso viva en dos lados y que borrarlo en
 * uno no lo borre en el otro.
 */

import { useCallback, useRef, useState } from "react";
import { ExternalLink, Loader2, Paperclip, X } from "@buleje/design-system/icons";
import { archivarEnDrive } from "@/lib/forestal/ctp-archivar-documento";
import type { AdjuntoParte } from "@/lib/forestal/directorio";

/** Carpeta del Drive donde viven los papeles de las partes. */
const CARPETA = "Directorio forestal";

export default function CtpParteAdjuntos({
  adjuntos,
  nombreParte,
  onCambio,
}: {
  adjuntos: AdjuntoParte[];
  /** Para etiquetar el archivo: en el Drive se busca por el nombre del titular. */
  nombreParte: string;
  onCambio: (lista: AdjuntoParte[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = useCallback(
    async (archivo: File | undefined) => {
      if (!archivo) return;
      setError(null);
      setSubiendo(true);
      try {
        const r = await archivarEnDrive({
          archivo,
          nombreArchivo: archivo.name,
          carpeta: CARPETA,
          etiquetas: ["forestal", "directorio", nombreParte].filter(Boolean),
          descripcion: `Documento de ${nombreParte || "un titular"} — cargado desde el directorio forestal.`,
        });
        onCambio([
          ...adjuntos,
          {
            documentId: r.documentId,
            rotulo: archivo.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120),
            vinculadoEl: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir el documento.");
      } finally {
        setSubiendo(false);
        if (input.current) input.current.value = "";
      }
    },
    [adjuntos, nombreParte, onCambio],
  );

  return (
    <div className="space-y-3">
      {adjuntos.length > 0 && (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border-2 border-[var(--rule-base)]">
          {adjuntos.map((a) => (
            <li key={a.documentId} className="flex items-center gap-3 px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-base text-[var(--text-primary)]">{a.rotulo}</span>
              <a
                href={`/api/admin/documents/${encodeURIComponent(a.documentId)}/download`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir el documento"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                <span className="sr-only">Abrir {a.rotulo}</span>
              </a>
              <button
                type="button"
                // Desvincula, NO borra: el archivo sigue en el Drive con su
                // historial. Sacarlo de acá es decir "este papel no es de este
                // titular", no "este papel no existe".
                onClick={() => onCambio(adjuntos.filter((x) => x.documentId !== a.documentId))}
                title="Quitar de este titular (el archivo queda en el Drive)"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-600)]"
              >
                <X className="h-4 w-4" aria-hidden />
                <span className="sr-only">Quitar {a.rotulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={subiendo}
          className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-60"
        >
          {subiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Paperclip className="h-4 w-4" aria-hidden />}
          {subiendo ? "Subiendo…" : "Subir documento"}
        </button>
        <p className="text-sm text-[var(--text-tertiary)]">
          Permiso, resolución, copia del RUC. Se guardan en Documentos › {CARPETA}.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      <input ref={input} type="file" className="hidden" onChange={(e) => void subir(e.target.files?.[0])} />
    </div>
  );
}
