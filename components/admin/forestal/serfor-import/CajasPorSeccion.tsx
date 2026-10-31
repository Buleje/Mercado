"use client";

/**
 * Una caja de arrastre por sección del libro, y en cada caja los archivos que
 * quieras (Brandon 19-10: «de 1 hasta más archivos, y en cada archivo poner
 * por separado a qué permiso pertenece»).
 *
 * El libro del SNIFFS se puede bajar entero —un Excel con cinco hojas— o
 * sección por sección. Acá cada archivo va a su casilla, se ve cuáles ya
 * entraron, y recién con todo a la vista se importa una vez. El orden de
 * escritura lo sigue decidiendo `ctp-serfor-secuencia.ts`: la caja no es el
 * orden, es la bandeja.
 *
 * NO acepta un archivo en la casilla equivocada: si sueltas Consumos en la
 * caja de Ingresos, lo dice.
 */

import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle, Plus, Upload } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import {
  FORMATOS_INVENTARIO,
  FORMATOS_LIBRO,
  TITULO_FORMATO,
  type FormatoCtp,
} from "@/lib/forestal/ctp-formatos-serfor";
import type { ArchivoCargado } from "./use-archivos-del-libro";
import ResumenRollizaPatio, { lineaDeRolliza } from "./ResumenRollizaPatio";
import FilaDeArchivo, { type EstadoDeEnvio } from "./FilaDeArchivo";

/** Qué trae cada sección, en una línea, para quien no se acuerda cuál es cuál. */
const QUE_ES: Record<FormatoCtp, string> = {
  ingresos: "La madera que entró, con su GTF",
  consumos: "Qué trozas entraron a la sierra",
  retrozado: "Las trozas que se cortaron en pedazos",
  produccion: "Lo que salió de cada corrida",
  salidas: "Los despachos con su guía",
  inventarioTrozas: "Lo que hay HOY en el patio, troza por troza",
  inventarioAserrada: "Los paquetes que hay HOY en el depósito",
};

interface PropsComunes {
  /** Devuelve el error a mostrar en esa caja, o `null` si todo entró. */
  onAgregar: (formato: FormatoCtp, files: File[]) => Promise<string | null>;
  onQuitar: (id: string) => void;
  deshabilitado?: boolean;
  /** Cómo le fue a cada archivo en el último envío. */
  estadoDe?: (id: string) => EstadoDeEnvio;
  /** El selector de permiso de un archivo; `null` en las secciones que no lo llevan. */
  permiso?: (archivo: ArchivoCargado, deLaSeccion: readonly ArchivoCargado[]) => ReactNode;
}

export default function CajasPorSeccion({ archivos, ...resto }: PropsComunes & { archivos: readonly ArchivoCargado[] }) {
  return (
    <div className="space-y-4">
      {/* El libro y el inventario responden preguntas distintas —qué pasó vs.
          qué hay hoy—: en una sola grilla el inventario parecía una sección
          más del libro, que no lo es. */}
      {(
        [
          ["Las cinco secciones del libro", "Lo que pasó: entradas, aserrío y salidas", FORMATOS_LIBRO],
          ["Inventario de existencia", "Lo que hay hoy — es el saldo con el que arranca el libro", FORMATOS_INVENTARIO],
        ] as const
      ).map(([titulo, sub, lista]) => (
        <div key={titulo}>
          <p className="text-base font-extrabold text-[var(--text-primary)]">{titulo}</p>
          <p className="mb-2 text-sm text-[var(--text-tertiary)]">{sub}</p>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            {lista.map((f) => (
              <Caja key={f} formato={f} cargados={archivos.filter((a) => a.formato === f)} {...resto} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Caja({
  formato,
  cargados,
  onAgregar,
  onQuitar,
  deshabilitado,
  estadoDe,
  permiso,
}: PropsComunes & { formato: FormatoCtp; cargados: readonly ArchivoCargado[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const tomar = async (files: FileList | null | undefined) => {
    const lista = files ? Array.from(files) : [];
    if (lista.length === 0) return;
    setLeyendo(true);
    setError(null);
    try {
      setError(await onAgregar(formato, lista));
    } finally {
      setLeyendo(false);
      setEncima(false);
    }
  };

  const hay = cargados.length > 0;

  return (
    <div
      data-caja={formato}
      onDragOver={(e) => {
        e.preventDefault();
        if (!deshabilitado) setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        if (!deshabilitado) void tomar(e.dataTransfer.files);
      }}
      /* Con archivos cargados la caja lleva el permiso de cada uno: en media
         grilla quedaba apretada y la otra mitad vacía (QA 19-10). */
      className={`rounded-xl border-2 p-3 transition-colors ${hay ? "sm:col-span-2 " : ""}${
        error
          ? "border-[var(--data-error)] bg-[var(--data-error)]/5"
          : encima
            ? "border-primary bg-primary/10"
            : hay
              ? "border-[var(--data-success)] bg-[var(--data-success)]/5"
              : "border-dashed border-[var(--rule-base)]"
      }`}
    >
      <p className="flex items-center gap-1.5 text-base font-extrabold text-[var(--text-primary)]">
        {hay && <CheckCircle className="h-4 w-4 shrink-0 text-[var(--data-success)]" aria-hidden />}
        {TITULO_FORMATO[formato]}
        {cargados.length > 1 && (
          <span className="text-sm font-semibold text-[var(--text-tertiary)]">· {cargados.length} archivos</span>
        )}
      </p>
      <p className="text-sm text-[var(--text-tertiary)]">{QUE_ES[formato]}</p>

      {hay && (
        <ul className="mt-2 space-y-2">
          {cargados.map((a) => (
            <FilaDeArchivo
              key={a.id}
              archivo={a}
              estado={estadoDe?.(a.id) ?? null}
              onQuitar={(id) => {
                onQuitar(id);
                setError(null);
              }}
              deshabilitado={deshabilitado}
              linea={formato === "inventarioTrozas" ? lineaDeRolliza(a) : null}
            >
              {permiso?.(a, cargados)}
            </FilaDeArchivo>
          ))}
        </ul>
      )}
      {hay && formato === "inventarioTrozas" && <ResumenRollizaPatio archivos={cargados} />}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={deshabilitado || leyendo}
        className={
          hay
            ? button({ variant: "ghost", className: "mt-2 w-full" })
            : "mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-[var(--text-tertiary)] transition-colors hover:text-primary disabled:opacity-50"
        }
      >
        {hay ? <Plus className="h-5 w-5" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        {leyendo ? "Leyendo…" : hay ? "Agregar otro archivo" : "Suelta los archivos o toca acá"}
      </button>

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv"
        className="hidden"
        aria-label={`Archivos de ${TITULO_FORMATO[formato]}`}
        onChange={(e) => {
          void tomar(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
