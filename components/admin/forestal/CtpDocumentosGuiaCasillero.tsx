"use client";

/**
 * Un casillero de «Documentos de la guía» (ADR-438): su nombre, los archivos
 * que tiene (miniatura, quién y cuándo, ver / reemplazar / quitar) y cómo se
 * agrega uno — la cámara del celular o un archivo de la PC.
 */

import { useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Camera, FileText, FileUp, Loader2, RefreshCw, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateTime } from "@/lib/format";
import type { CasilleroConDocs, DocumentoDeGuia } from "@/hooks/use-documentos-guia";

const BOTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-canvas)] disabled:opacity-40";
const ICONO_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--surface-canvas)] disabled:opacity-40";

function peso(b: number): string {
  return b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}

function Archivo({
  doc,
  ocupado,
  puedeQuitar,
  onReemplazar,
  onQuitar,
}: {
  doc: DocumentoDeGuia;
  ocupado: boolean;
  /** `false` = el rol no puede quitar (sólo admin/dueño): el botón se deshabilita con el motivo. */
  puedeQuitar: boolean;
  onReemplazar: () => void;
  onQuitar: () => void;
}) {
  const esImagen = doc.mimeType.startsWith("image/");
  return (
    <li className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)] p-2">
      <a
        href={doc.src}
        target="_blank"
        rel="noopener noreferrer"
        title={`Ver «${doc.name}»`}
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]"
      >
        {esImagen ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada que redirige: next/image no la optimiza
          <img src={doc.src} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
        )}
      </a>
      <div className="min-w-0 flex-1">
        <a
          href={doc.src}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-semibold text-[var(--text-primary)] underline-offset-2 hover:underline"
          title={doc.name}
        >
          {doc.name}
        </a>
        <p className="truncate text-xs text-[var(--text-tertiary)]">
          {doc.uploadedById} · {formatDateTime(doc.uploadedAt)} · {peso(doc.size)}
          {doc.legado ? " · guardado desde «Documento de la guía»" : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onReemplazar}
        disabled={ocupado}
        className={ICONO_BTN}
        title="Reemplazar por otro archivo"
        aria-label={`Reemplazar «${doc.name}»`}
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onQuitar}
        disabled={ocupado || !puedeQuitar}
        className={`${ICONO_BTN} hover:text-[var(--data-error-600)]`}
        title={
          puedeQuitar
            ? "Quitar (va a la papelera del Drive)"
            : "Sólo el administrador o el dueño pueden quitar un documento del expediente"
        }
        aria-label={`Quitar «${doc.name}»`}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

export default function CtpDocumentosGuiaCasillero({
  casillero,
  subiendo,
  puedeQuitar = true,
  onSubir,
  onQuitar,
  onArmarGtf,
}: {
  casillero: CasilleroConDocs;
  subiendo: boolean;
  /** `false` = el rol no puede quitar (sólo admin/dueño): «Quitar» se deshabilita con el motivo. */
  puedeQuitar?: boolean;
  /** Sube los archivos elegidos; con `reemplaza`, el primero ocupa ese lugar. */
  onSubir: (files: File[], reemplaza?: string) => void;
  onQuitar: (doc: DocumentoDeGuia) => void;
  /** Sólo en el casillero GTF: abrir el papel que arma el sistema para guardarlo acá. */
  onArmarGtf?: () => void;
}) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const reemplazoRef = useRef<HTMLInputElement>(null);
  const [aReemplazar, setAReemplazar] = useState<string | null>(null);
  const n = casillero.docs.length;
  const idBase = `docs-guia-${casillero.clave}`;

  const alElegir = (lista: FileList | null, reemplaza?: string) => {
    const files = Array.from(lista ?? []);
    if (files.length > 0) onSubir(reemplaza ? files.slice(0, 1) : files, reemplaza);
  };

  return (
    <section
      aria-labelledby={`${idBase}-titulo`}
      className={`flex flex-col gap-2 rounded-2xl border-2 p-3 ${
        n > 0
          ? "border-[var(--rule-base)] bg-[var(--surface-raised)]"
          : "border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)]/40"
      }`}
    >
      <header className="flex items-center gap-1.5">
        <CardTitle id={`${idBase}-titulo`} className="text-sm font-bold min-w-0 flex-1 truncate">
          {casillero.label}
        </CardTitle>
        <InfoTip
          title={casillero.label}
          what={casillero.hint}
          example="Una foto por hoja, o el PDF entero. Hasta 4 MB por archivo."
        />
        <span className="shrink-0 text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
          {n === 0 ? "vacío" : `${n} archivo${n === 1 ? "" : "s"}`}
        </span>
      </header>

      {n > 0 && (
        <ul className="flex flex-col gap-1.5">
          {casillero.docs.map((d) => (
            <Archivo
              key={d.id}
              doc={d}
              ocupado={subiendo}
              puedeQuitar={puedeQuitar}
              onReemplazar={() => {
                setAReemplazar(d.id);
                reemplazoRef.current?.click();
              }}
              onQuitar={() => onQuitar(d)}
            />
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => camaraRef.current?.click()}
          disabled={subiendo}
          className={`${BOTON} grow basis-24`}
        >
          <Camera className="h-4 w-4" aria-hidden /> Foto
        </button>
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={subiendo}
          className={`${BOTON} grow basis-24`}
        >
          {subiendo ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileUp className="h-4 w-4" aria-hidden />
          )}
          {subiendo ? "Subiendo…" : "Archivo"}
        </button>
        {onArmarGtf && n === 0 && (
          <button
            type="button"
            onClick={onArmarGtf}
            className={`${BOTON} w-full`}
            title="Abre la GTF que arma el sistema; con «Guardar en el expediente» cae en este casillero"
          >
            <FileText className="h-4 w-4" aria-hidden /> La del sistema
          </button>
        )}
      </div>

      {/* Tres entradas ocultas: la cámara trasera del celular, un archivo (PDF o
          foto, varios a la vez) y el reemplazo de uno puntual. */}
      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          alElegir(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={archivoRef}
        type="file"
        accept="application/pdf,image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          alElegir(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={reemplazoRef}
        type="file"
        accept="application/pdf,image/*,.heic,.heif"
        hidden
        onChange={(e) => {
          if (aReemplazar) alElegir(e.target.files, aReemplazar);
          setAReemplazar(null);
          e.target.value = "";
        }}
      />
    </section>
  );
}
