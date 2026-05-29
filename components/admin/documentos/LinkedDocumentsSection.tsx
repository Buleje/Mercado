"use client";

/**
 * ADR-119 — Bloque "Documentos" para la ficha de un cliente o proveedor.
 * Lee los documentos vinculados (Document.customerId / supplierId) y permite
 * verlos/descargarlos sin salir de la ficha. Lado inverso del picker del modal.
 */

import { useState, useEffect } from "react";
import { FileText, Download, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { getSignedDownloadUrl } from "@/hooks/use-documents";
import type { DbDocument } from "@/lib/types/documents";

type Entity = "customer" | "supplier";

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function LinkedDocumentsSection({ entity, id }: { entity: Entity; id: string }) {
  const [docs, setDocs] = useState<DbDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const param = entity === "customer" ? "customerId" : "supplierId";
    fetch(`/api/admin/documents?${param}=${encodeURIComponent(id)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => {/* ficha sigue funcionando sin documentos */})
      .finally(() => setLoading(false));
  }, [entity, id]);

  async function download(doc: DbDocument) {
    try {
      const { url, filename } = await getSignedDownloadUrl(doc.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* link no disponible */
    }
  }

  // No mostramos el bloque si no hay nada vinculado (evita ruido en la ficha).
  if (!loading && docs.length === 0) return null;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <p className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-[var(--accent)]" /> Documentos
        {docs.length > 0 && (
          <span className="text-[length:var(--ts-2xs,11px)] tabular-nums font-bold px-1.5 py-0.5 rounded-md bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
            {docs.length}
          </span>
        )}
      </p>

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-9 bg-[var(--surface-sunken)] rounded-lg" />)}
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const n = daysUntil(d.expiresAt);
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-sunken)] shrink-0">
                  <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{d.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)] capitalize">{d.category} · {fmtBytes(d.size)}</span>
                    {n !== null && (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[length:var(--ts-2xs,11px)] font-bold px-1.5 py-0.5 rounded-md",
                        n < 0 ? "bg-[var(--data-error-50,#fef2f2)] text-[var(--data-error-600,#dc2626)]"
                          : n <= 7 ? "bg-[var(--data-error-50,#fef2f2)] text-[var(--data-error-600,#dc2626)]"
                          : n <= 30 ? "bg-[var(--data-warning-50,#fffbeb)] text-[var(--data-warning-700,#b45309)]"
                          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                      )}>
                        <Clock className="h-3 w-3" />
                        {n < 0 ? "Vencido" : n === 0 ? "Vence hoy" : `Vence en ${n}d`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => download(d)}
                  className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                  aria-label={`Descargar ${d.name}`}
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
