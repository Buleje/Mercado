"use client";

/**
 * Un documento esperado («DNI del jefe o representante»): su estado, sus
 * archivos y cómo se agrega uno — arrastrándolo encima, con la cámara del
 * celular o eligiéndolo de la PC (PDF, foto, Word, Excel). Mismo casillero que
 * «Documentos de la guía» (ADR-438), con el vencimiento en cada archivo.
 *
 * También sirve para «Otros archivos de la carpeta» (sin casillero): ahí no
 * hay estado, sólo la lista y la zona para soltar.
 */

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Camera, FileUp } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PastillaEstado } from "./estados";
import ArchivoFila, { FilaSubida } from "./ArchivoFila";
import type { ArchivoVista, CasilleroVista } from "./modelo";
import type { SubidaEnCurso } from "../hooks/use-plan-documentos";

/** Lo que el Drive muestra bien y lo que se usa en un expediente. */
export const ACEPTA = "application/pdf,image/*,.heic,.heif,.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv";

const BOTON =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-40";

export default function CasilleroArchivos({
  domId,
  titulo,
  casillero,
  archivos,
  subidas,
  ocupado,
  vacio,
  onSubir,
  onVer,
  onQuitar,
  onVence,
  onDescartarSubida,
  extra,
}: {
  domId: string;
  titulo: string;
  /** null = «Otros archivos de la carpeta» (sin estado). */
  casillero: CasilleroVista | null;
  archivos: readonly ArchivoVista[];
  subidas: readonly SubidaEnCurso[];
  ocupado: boolean;
  vacio: string;
  onSubir: (files: File[]) => void;
  onVer: (a: ArchivoVista) => void;
  onQuitar: (a: ArchivoVista) => void;
  onVence: (a: ArchivoVista, fecha: string | null) => void;
  onDescartarSubida: (key: string) => void;
  /** Algo al lado del título (el «sólo este plan»). */
  extra?: ReactNode;
}) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const n = archivos.length;
  const vence = casillero?.archivos.map((a) => a.vence).filter((v): v is string => Boolean(v)).sort()[0] ?? null;

  const elegir = (lista: FileList | null) => {
    const files = Array.from(lista ?? []);
    if (files.length > 0) onSubir(files);
  };
  const soltar = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setEncima(false);
    if (!ocupado) elegir(e.dataTransfer.files);
  };

  return (
    <section
      id={domId}
      tabIndex={-1}
      aria-labelledby={`${domId}-titulo`}
      data-casillero-plan={casillero?.clave ?? "sueltos"}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(false);
      }}
      onDrop={soltar}
      className={`flex min-w-0 flex-col gap-2 rounded-2xl border-2 p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
        encima
          ? "border-[var(--accent)] bg-[var(--accent)]/8"
          : n > 0
            ? "border-[var(--rule-base)] bg-[var(--surface-raised)]"
            : "border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)]"
      }`}
    >
      <header className="flex flex-wrap items-center gap-1.5">
        <CardTitle as="h5" id={`${domId}-titulo`} className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-bold leading-snug" title={titulo}>
          {titulo}
        </CardTitle>
        {casillero?.descripcion && <InfoTip title={titulo} what={casillero.descripcion} example="Frente y dorso en dos fotos, o todo en un PDF." />}
        {extra}
        {casillero && <PastillaEstado estado={casillero.estado} vence={vence} porSubir={casillero.archivos.some((a) => a.pendiente)} />}
      </header>

      {(n > 0 || subidas.length > 0) && (
        <ul className="flex flex-col gap-1.5">
          {archivos.map((a) => (
            <ArchivoFila
              key={a.key}
              archivo={a}
              ocupado={ocupado}
              onVer={() => onVer(a)}
              onQuitar={() => onQuitar(a)}
              onVence={(f) => onVence(a, f)}
            />
          ))}
          {subidas.map((s) => (
            <FilaSubida key={s.key} nombre={s.nombre} estado={s.estado} motivo={s.motivo} onDescartar={() => onDescartarSubida(s.key)} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {n === 0 && subidas.length === 0 && <p className="w-full text-xs text-[var(--text-tertiary)]">{vacio}</p>}
        <button type="button" onClick={() => camaraRef.current?.click()} disabled={ocupado} className={`${BOTON} grow basis-24 whitespace-nowrap sm:hidden`}>
          <Camera className="h-4 w-4" aria-hidden="true" /> Foto
        </button>
        <button type="button" onClick={() => archivoRef.current?.click()} disabled={ocupado} className={`${BOTON} grow basis-24 whitespace-nowrap sm:grow-0 sm:basis-auto`}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          {n > 0 ? "Agregar otro" : "Subir archivo"}
        </button>
        <span className="hidden text-xs text-[var(--text-tertiary)] sm:inline">o arrástralo aquí</span>
      </div>

      <input
        ref={archivoRef}
        type="file"
        multiple
        accept={ACEPTA}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          elegir(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          elegir(e.target.files);
          e.target.value = "";
        }}
      />
    </section>
  );
}
