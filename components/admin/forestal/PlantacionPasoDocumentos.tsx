"use client";

/**
 * PlantacionPasoDocumentos — Sección 14 del RNPF ("Documentación
 * Sustentatoria"): una tarjeta por categoría del catálogo, cada una con su
 * clasificación (requerido/opcional/no corresponde) y su archivo.
 *
 * El archivo va al Drive del tenant (mismo camino real que `CtpParteAdjuntos`:
 * `archivarEnDrive` directo, sin pasar por el visor de documentos) — en
 * `documentos` sólo queda el `documentId` apuntador. Nunca se hace obligatorio
 * un documento marcado "No corresponde".
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MinusCircle, Paperclip, X, type LucideIcon } from "@buleje/design-system/icons";
import { archivarEnDrive } from "@/lib/forestal/ctp-archivar-documento";
import { CATEGORIAS_DOCUMENTO_PLANTACION, type ClasificacionDocumento } from "@/lib/forestal/plantacion-catalogo";
import type { DocumentoPlantacion } from "@/lib/forestal/plantacion-tramite";

/** Carpeta del Drive donde viven los papeles del RNPF. */
const CARPETA = "Plantaciones forestales (RNPF)";

/** Sólo el mapa/croquis y el documento de propiedad son requeridos por
 *  defecto — el resto depende del caso (posesión, representación, comunidad,
 *  título habilitante) y el operador lo ajusta con el selector. */
function claseDefault(key: string): ClasificacionDocumento {
  return key === "mapa_ubicacion" || key === "doc_propiedad" ? "requerido" : "opcional";
}

type Estado = "ok" | "falta" | "opcional" | "na";

const ESTADO_META: Record<Estado, { icon: LucideIcon; cls: string; label: string }> = {
  ok: { icon: CheckCircle2, cls: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", label: "Adjuntado" },
  falta: { icon: AlertTriangle, cls: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", label: "Requerido — falta" },
  opcional: { icon: MinusCircle, cls: "text-[var(--text-tertiary)]", label: "Opcional — sin adjuntar" },
  na: { icon: MinusCircle, cls: "text-[var(--text-tertiary)]", label: "No corresponde" },
};

function estadoDe(doc: DocumentoPlantacion): Estado {
  if (doc.clasificacion === "no_corresponde") return "na";
  if (doc.documentId) return "ok";
  return doc.clasificacion === "requerido" ? "falta" : "opcional";
}

export default function PlantacionPasoDocumentos({
  documentos,
  tipoTramite,
  soloLectura,
  onChange,
}: {
  documentos: DocumentoPlantacion[];
  tipoTramite: "inscripcion" | "actualizacion";
  soloLectura?: boolean;
  onChange: (documentos: DocumentoPlantacion[]) => void;
}) {
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const vista = useMemo<DocumentoPlantacion[]>(
    () =>
      CATEGORIAS_DOCUMENTO_PLANTACION.map(
        (cat) => documentos.find((d) => d.categoria === cat.key) ?? { categoria: cat.key, clasificacion: claseDefault(cat.key), documentId: null, rotulo: null },
      ),
    [documentos],
  );

  function actualizar(categoria: string, patch: Partial<DocumentoPlantacion>) {
    onChange(vista.map((d) => (d.categoria === categoria ? { ...d, ...patch } : d)));
  }

  async function subir(categoria: string, label: string, archivo: File | undefined) {
    if (!archivo) return;
    setErrores((e) => ({ ...e, [categoria]: "" }));
    setSubiendo(categoria);
    try {
      const r = await archivarEnDrive({
        archivo,
        nombreArchivo: archivo.name,
        carpeta: CARPETA,
        etiquetas: ["forestal", "rnpf", tipoTramite, label],
        descripcion: `${label} — Registro de Plantación Forestal (${tipoTramite === "inscripcion" ? "inscripción" : "actualización"}).`,
      });
      actualizar(categoria, { documentId: r.documentId, rotulo: archivo.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) });
    } catch (err) {
      setErrores((e) => ({ ...e, [categoria]: err instanceof Error ? err.message : "No se pudo subir el documento." }));
    } finally {
      setSubiendo(null);
      const input = inputs.current[categoria];
      if (input) input.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {CATEGORIAS_DOCUMENTO_PLANTACION.map((cat) => {
        const doc = vista.find((d) => d.categoria === cat.key) ?? { categoria: cat.key, clasificacion: claseDefault(cat.key), documentId: null, rotulo: null };
        const meta = ESTADO_META[estadoDe(doc)];

        return (
          <div key={cat.key} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">{cat.label}</p>
                <p className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold ${meta.cls}`}>
                  <meta.icon className="h-3.5 w-3.5" aria-hidden="true" /> {meta.label}
                </p>
              </div>
              {!soloLectura && (
                <select
                  value={doc.clasificacion}
                  onChange={(e) => actualizar(cat.key, { clasificacion: e.target.value as ClasificacionDocumento })}
                  className="h-9 shrink-0 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-primary)]"
                >
                  <option value="requerido">Requerido</option>
                  <option value="opcional">Opcional</option>
                  <option value="no_corresponde">No corresponde</option>
                </select>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {doc.documentId ? (
                <>
                  <a
                    href={`/api/admin/documents/${encodeURIComponent(doc.documentId)}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">{doc.rotulo || "Ver documento"}</span>
                  </a>
                  {!soloLectura && (
                    <button
                      type="button"
                      onClick={() => actualizar(cat.key, { documentId: null, rotulo: null })}
                      title="Quitar (el archivo queda en el Drive)"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-600)]"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Quitar {cat.label}</span>
                    </button>
                  )}
                </>
              ) : !soloLectura ? (
                <>
                  <button
                    type="button"
                    onClick={() => inputs.current[cat.key]?.click()}
                    disabled={subiendo === cat.key}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-60 dark:hover:text-[var(--accent)]"
                  >
                    {subiendo === cat.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}
                    {subiendo === cat.key ? "Subiendo…" : "Subir documento"}
                  </button>
                  <input
                    ref={(el) => {
                      inputs.current[cat.key] = el;
                    }}
                    type="file"
                    className="hidden"
                    onChange={(e) => void subir(cat.key, cat.label, e.target.files?.[0])}
                  />
                </>
              ) : (
                <span className="text-xs text-[var(--text-tertiary)]">Sin adjuntar</span>
              )}
            </div>

            {errores[cat.key] && (
              <p role="alert" className="mt-2 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                {errores[cat.key]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
