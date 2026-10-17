"use client";

/**
 * CroquisModal — subir un croquis o una foto del espacio, o cambiar el que
 * ya está (ADR-497): la imagen va a `/api/upload` (carpeta del plan, JPG, PNG
 * o WebP) apenas se elige; se guarda con su título y su nota al confirmar.
 * Se monta con `key`: cada apertura parte de `inicial`.
 */
import { useId, useRef, useState } from "react";
import { Image as IconoImagen, Upload } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { subirArchivoPlan } from "../empresa/licencias-util";
import { AREA_TEXTO, CAMPO_ALTO } from "../piezas/clases";
import type { Croquis } from "./espacios-config";

const TIPOS_IMAGEN = "image/jpeg,image/png,image/webp";

interface Props {
  abierto: boolean;
  inicial: Croquis;
  esNuevo: boolean;
  onCerrar: () => void;
  onGuardar: (c: Croquis) => void;
}

export function CroquisModal({ abierto, inicial, esNuevo, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<Croquis>(inicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poner = <K extends keyof Croquis>(k: K, v: Croquis[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setError(null);
  };

  const subir = async (file: File | undefined) => {
    if (!file) return;
    if (!TIPOS_IMAGEN.split(",").includes(file.type)) return setError("Elige una imagen JPG, PNG o WebP.");
    setSubiendo(true);
    setError(null);
    try {
      const url = await subirArchivoPlan(file);
      setF((p) => ({ ...p, url, titulo: p.titulo || file.name.replace(/\.[^.]+$/, "").slice(0, 160) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };

  const guardar = () => {
    if (subiendo) return;
    if (!f.url) return setError("Sube la imagen del croquis.");
    const titulo = f.titulo.trim();
    if (!titulo) return setError("Escribe un título: «Planta del local», «Parcela norte».");
    onGuardar({ ...f, titulo, nota: f.nota.trim() });
    onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={esNuevo ? "Subir croquis" : "Editar croquis"}
      icon={IconoImagen}
      size="md"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })} disabled={subiendo}>
            {esNuevo ? "Agregar" : "Guardar cambios"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        className={cn(MODAL_BODY, "space-y-5")}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <div className="space-y-3">
          {f.url ? (
            <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida por el negocio, de cualquier origen */}
              <img src={f.url} alt={f.titulo || "Croquis"} className="mx-auto max-h-64 w-full object-contain" />
            </div>
          ) : (
            <button
              type="button"
              disabled={subiendo}
              onClick={() => archivoRef.current?.click()}
              className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--rule-strong)] p-6 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:opacity-60"
            >
              <Upload className="size-6" aria-hidden />
              {subiendo ? "Subiendo…" : "Toca para elegir la imagen (JPG, PNG o WebP)"}
            </button>
          )}
          <input
            ref={archivoRef}
            type="file"
            accept={TIPOS_IMAGEN}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void subir(e.target.files?.[0])}
          />
          {f.url && (
            <button type="button" className={button({ variant: "secondary" })} disabled={subiendo} onClick={() => archivoRef.current?.click()}>
              <Upload className="size-4" aria-hidden />
              {subiendo ? "Subiendo…" : "Cambiar la imagen"}
            </button>
          )}
        </div>

        <Field label="Título" required>
          <input type="text" className={CAMPO_ALTO} value={f.titulo} maxLength={160} placeholder="Planta del local" onChange={(e) => poner("titulo", e.target.value)} />
        </Field>

        <Field label="Nota" hint="Qué muestra, medidas, cuándo se hizo.">
          <textarea className={AREA_TEXTO} rows={3} value={f.nota} maxLength={600} onChange={(e) => poner("nota", e.target.value)} />
        </Field>
      </form>
    </AdminModal>
  );
}
