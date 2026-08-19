"use client";

/**
 * Una caja de arrastre por sección del libro.
 *
 * El libro del SNIFFS se puede bajar entero —un Excel con cinco hojas— o
 * sección por sección, que es como trabaja quien consulta el SNIFFS de a poco.
 * Con una sola caja, ese operador tenía que subir cinco veces y en el orden
 * correcto, o perdía la cadena entre secciones.
 *
 * Acá suelta cada archivo en su casilla, ve cuáles ya cargó, y recién cuando
 * están todas las que necesita importa una vez. El orden de escritura lo sigue
 * decidiendo `ctp-serfor-secuencia.ts`: la caja no es el orden, es la bandeja.
 *
 * NO acepta un archivo en la casilla equivocada. Si soltás Consumos en la caja
 * de Ingresos, lo dice — cargarlo igual «porque se reconoce solo» dejaría al
 * operador creyendo que puso una sección que en realidad reemplazó otra.
 */

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Upload, X } from "@buleje/design-system/icons";
import {
  FORMATOS_INVENTARIO,
  FORMATOS_LIBRO,
  TITULO_FORMATO,
  type FormatoCtp,
} from "@/lib/forestal/ctp-formatos-serfor";
import type { SeccionDelLibro } from "@/lib/forestal/ctp-serfor-secuencia";

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

export type ArchivoDeSeccion = {
  nombre: string;
  seccion: SeccionDelLibro;
};

export default function CajasPorSeccion({
  cargadas,
  onArchivo,
  onQuitar,
  deshabilitado,
}: {
  cargadas: Map<FormatoCtp, ArchivoDeSeccion>;
  /** Devuelve el error a mostrar en esa caja, o `null` si entró bien. */
  onArchivo: (formato: FormatoCtp, file: File) => Promise<string | null>;
  onQuitar: (formato: FormatoCtp) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* El libro y el inventario responden preguntas distintas —qué pasó vs.
          qué hay hoy— y mezclarlos en una sola grilla hacía que el inventario
          pareciera una sección más del libro, que no lo es. */}
      {(
        [
          ["Las cinco secciones del libro", "Lo que pasó: entradas, aserrío y salidas", FORMATOS_LIBRO],
          ["Inventario de existencia", "Lo que hay hoy — es el saldo con el que arranca el libro", FORMATOS_INVENTARIO],
        ] as const
      ).map(([titulo, sub, lista]) => (
        <div key={titulo}>
          <p className="text-base font-extrabold text-[var(--text-primary)]">{titulo}</p>
          <p className="mb-2 text-sm text-[var(--text-tertiary)]">{sub}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {lista.map((f) => (
              <Caja
                key={f}
                formato={f as FormatoCtp}
                cargada={cargadas.get(f as FormatoCtp)}
                onArchivo={onArchivo}
                onQuitar={onQuitar}
                deshabilitado={deshabilitado}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Caja({
  formato,
  cargada,
  onArchivo,
  onQuitar,
  deshabilitado,
}: {
  formato: FormatoCtp;
  cargada?: ArchivoDeSeccion;
  onArchivo: (formato: FormatoCtp, file: File) => Promise<string | null>;
  onQuitar: (formato: FormatoCtp) => void;
  deshabilitado?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const tomar = async (file: File | undefined) => {
    if (!file) return;
    setLeyendo(true);
    setError(null);
    try {
      setError(await onArchivo(formato, file));
    } finally {
      setLeyendo(false);
      setEncima(false);
    }
  };

  const listas = cargada ? cargada.seccion.parseadas.filter((p) => p.problemas.length === 0).length : 0;
  const malas = cargada ? cargada.seccion.parseadas.length - listas : 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!deshabilitado) setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        if (!deshabilitado) void tomar(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-xl border-2 p-3 transition-colors ${
        error
          ? "border-[var(--data-error)] bg-[var(--data-error)]/5"
          : cargada
            ? "border-[var(--data-success)] bg-[var(--data-success)]/5"
            : encima
              ? "border-primary bg-primary/10"
              : "border-dashed border-[var(--rule-base)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-base font-extrabold text-[var(--text-primary)]">
            {cargada && <CheckCircle className="h-4 w-4 shrink-0 text-[var(--data-success)]" aria-hidden />}
            {TITULO_FORMATO[formato]}
          </p>
          <p className="text-sm text-[var(--text-tertiary)]">{QUE_ES[formato]}</p>
        </div>
        {cargada && !deshabilitado && (
          <button
            onClick={() => {
              onQuitar(formato);
              setError(null);
            }}
            aria-label={`Quitar el archivo de ${TITULO_FORMATO[formato]}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {cargada ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          <span className="block truncate font-semibold text-[var(--text-primary)]">{cargada.nombre}</span>
          <strong className="tabular-nums">{listas}</strong> filas listas
          {malas > 0 && (
            <span className="font-semibold text-[var(--data-warning)]">
              {" · "}
              <span className="tabular-nums">{malas}</span> incompleta{malas === 1 ? "" : "s"}
            </span>
          )}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={deshabilitado || leyendo}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-[var(--text-tertiary)] transition-colors hover:text-primary disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden />
          {leyendo ? "Leyendo…" : "Soltá el archivo o tocá acá"}
        </button>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          void tomar(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
