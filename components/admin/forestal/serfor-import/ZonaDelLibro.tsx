"use client";

/**
 * Modo «Un solo archivo»: dónde se suelta el Excel de cinco hojas y, cuando
 * trae secciones que originan madera, el permiso de todo el libro (Brandon
 * 19-10, ADR-503). Un Excel = un permiso; si mezcla dos, el camino es «Un
 * archivo por sección».
 */

import { useRef, type ReactNode } from "react";
import { Upload } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export default function ZonaDelLibro({
  nombreArchivo,
  leyendo,
  deshabilitado,
  onArchivo,
  permiso,
}: {
  nombreArchivo: string | null;
  leyendo: boolean;
  deshabilitado: boolean;
  onArchivo: (f: File) => void;
  /** El selector del permiso; `null` si el libro no trae nada que lo lleve. */
  permiso: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f && !deshabilitado) onArchivo(f);
        }}
        disabled={deshabilitado || leyendo}
        className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] px-6 py-8 transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
      >
        <Upload className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
        <span className="text-base font-bold text-[var(--text-primary)]">
          {leyendo ? "Leyendo…" : (nombreArchivo ?? "Suelta el archivo o toca para elegirlo")}
        </span>
        <span className="text-sm text-[var(--text-tertiary)]">Excel (.xlsx) o CSV · las 5 secciones del libro</span>
      </button>
      {/* El input vive FUERA del botón: un control de formulario no puede
          colgar de un `<button>`. */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        aria-label="Archivo del libro"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArchivo(f);
          e.target.value = "";
        }}
      />

      {permiso && (
        <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4" data-permiso-libro>
          <p className="flex items-center gap-1.5 text-base font-extrabold text-[var(--text-primary)]">
            Permiso de todo el libro
            <InfoTip
              icono="ayuda"
              title="Un permiso para todo el archivo"
              what="Las filas de Ingresos, Producción y los inventarios que vengan sin contrato quedan con este permiso. Las que ya traen uno conservan el suyo."
              example="Si el libro mezcla dos permisos, súbelo con «Un archivo por sección» y elige uno por archivo."
            />
          </p>
          {permiso}
        </div>
      )}
    </>
  );
}
