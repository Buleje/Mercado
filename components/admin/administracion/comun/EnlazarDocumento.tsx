"use client";

/**
 * EnlazarDocumento — elegir un papel que YA está en el Archivo (buscar por
 * nombre o código) o subir uno nuevo, para colgarlo de un requisito, un
 * alquiler o un pago. Se abre desde otra ventana: va encima (`aboveModals`).
 */
import { useEffect, useId, useRef, useState } from "react";
import { FileText, Loader2, Search, Upload } from "@buleje/design-system/icons";
import { EmptyState } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import { CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import type { DbDocument } from "@/lib/types/documents";

interface Props {
  titulo: string;
  /** Para qué es («DNI vigente»): se usa de búsqueda inicial. */
  sugerencia?: string;
  onElegir: (doc: { id: string; nombre: string }) => Promise<void> | void;
  onSubir: (archivo: File) => Promise<void> | void;
  onCerrar: () => void;
}

const LIMITE = 12;
const ESPERA_MS = 250;

export function EnlazarDocumento({ titulo, sugerencia = "", onElegir, onSubir, onCerrar }: Props) {
  const [q, setQ] = useState(sugerencia);
  const [docs, setDocs] = useState<DbDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const archivoId = useId();

  /* Buscar mientras se escribe, con una pausa corta; la respuesta vieja no pisa a la nueva. */
  useEffect(() => {
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/documents?q=${encodeURIComponent(q.trim())}&limite=${LIMITE}`, { credentials: "include", cache: "no-store" });
        const j = (await r.json().catch(() => null)) as { documents?: DbDocument[] } | null;
        if (!vigente) return;
        if (!r.ok) throw new Error(String(r.status));
        setDocs((j?.documents ?? []).filter((d) => !d.deletedAt).slice(0, LIMITE));
        setError(null);
      } catch {
        if (vigente) setError("No se pudo buscar en el Archivo.");
      }
    }, ESPERA_MS);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q]);

  const elegir = async (d: DbDocument) => {
    setOcupado(true);
    await onElegir({ id: d.id, nombre: d.name });
    setOcupado(false);
  };

  const subir = async (f: File | undefined) => {
    if (!f) return;
    setOcupado(true);
    await onSubir(f);
    setOcupado(false);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      aboveModals
      title={titulo}
      description="Elige un papel del Archivo o sube uno nuevo"
      icon={FileText}
      size="md"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cerrar
          </button>
          <input ref={archivo} id={archivoId} type="file" className="sr-only" tabIndex={-1} onChange={(e) => void subir(e.target.files?.[0])} />
          <button type="button" className={button({ variant: "primary" })} disabled={ocupado} onClick={() => archivo.current?.click()}>
            {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            Subir un archivo
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-3`}>
        <Field label="Buscar en el Archivo">
          {(id) => (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
              <input id={id} type="search" className={`${CAMPO_ALTO} pl-9`} value={q} placeholder="Nombre o código (DOC-000123)" onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
        </Field>
        {docs === null ? (
          <p className="text-sm text-[var(--text-tertiary)]">Buscando…</p>
        ) : docs.length === 0 ? (
          <EmptyState title="No hay papeles con ese nombre" description="Prueba con otra palabra o sube el archivo." />
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]" aria-label="Papeles del Archivo">
            {docs.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={button({ variant: "ghost", className: "h-auto min-h-12 w-full justify-start gap-3 px-2 text-left" })}
                  disabled={ocupado}
                  onClick={() => void elegir(d)}
                >
                  <FileText className="size-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  {d.codigo != null && <span className="shrink-0 text-sm text-[var(--text-tertiary)]">{formatoCodigoDocumento(d.codigo)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
