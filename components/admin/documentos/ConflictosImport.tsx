"use client";

/**
 * La pregunta que hace el explorador de Windows al copiar una carpeta encima de
 * otra: "ya hay un archivo con este nombre y otro contenido, ¿qué hago?".
 *
 * Antes el importador decidía solo: subía un segundo archivo con el mismo
 * nombre y quedaban dos "contrato.pdf" sin forma de saber cuál era cuál. Las
 * tres salidas son las del escritorio, con una ventaja: como el drive versiona,
 * "reemplazar" NO pierde nada — la versión anterior queda en el historial.
 */

import { AlertTriangle, Check, Copy, History, SkipForward } from "@buleje/design-system/icons";
import { bytesLegibles } from "@/lib/documentos/importar-arbol";
import type { Resolucion } from "@/lib/documentos/conflictos";

export interface FilaConflicto {
  ruta: string;
  nombre: string;
  carpeta: string;
  /** Peso del que se está subiendo. */
  size: number;
  /** Peso del que ya está en el drive. */
  sizeExistente: number;
}

const OPCIONES: { valor: Resolucion; titulo: string; detalle: string; Icon: typeof Check }[] = [
  {
    valor: "reemplazar",
    titulo: "Reemplazar",
    detalle: "Sube el nuevo como versión. La anterior queda en el historial del documento.",
    Icon: History,
  },
  {
    valor: "conservar-ambos",
    titulo: "Conservar los dos",
    detalle: 'El que subís queda como "nombre (2)". No se toca lo que ya estaba.',
    Icon: Copy,
  },
  {
    valor: "omitir",
    titulo: "Omitir",
    detalle: "No sube estos archivos. Queda lo que ya estaba en el drive.",
    Icon: SkipForward,
  },
];

export default function ConflictosImport({
  filas, resolucion, onCambiar,
}: {
  filas: FilaConflicto[];
  resolucion: Resolucion;
  onCambiar: (r: Resolucion) => void;
}) {
  if (filas.length === 0) return null;

  return (
    <section className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--data-warning-500)]/12">
      <p className="flex items-start gap-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {filas.length === 1
            ? "1 archivo ya existe con otro contenido"
            : `${filas.length} archivos ya existen con otro contenido`}
          {" — "}decidí qué hacer con {filas.length === 1 ? "él" : "ellos"}.
        </span>
      </p>

      {/* Una sola decisión para todos, como el "aplicar a todos" del explorador:
          elegir archivo por archivo en un import de 300 es peor que no preguntar. */}
      <div className="mt-2.5 grid gap-1.5 sm:grid-cols-3">
        {OPCIONES.map(({ valor, titulo, detalle, Icon }) => {
          const activa = resolucion === valor;
          return (
            <button
              key={valor}
              type="button"
              onClick={() => onCambiar(valor)}
              aria-pressed={activa}
              className={`flex flex-col gap-1 rounded-lg border-2 p-2.5 text-left transition-colors ${
                activa
                  ? "border-[var(--accent)] bg-primary/10"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-canvas)]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                <Icon className="h-4 w-4 shrink-0" />
                {titulo}
                {activa && <Check className="ml-auto h-3.5 w-3.5 text-[var(--accent-ink)] dark:text-[var(--accent)]" />}
              </span>
              <span className="text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">{detalle}</span>
            </button>
          );
        })}
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Ver cuáles son
        </summary>
        <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-auto text-xs">
          {filas.slice(0, 60).map((f) => (
            <li key={f.ruta} className="flex items-center gap-2 text-[var(--text-secondary)]">
              <span className="min-w-0 flex-1 truncate" title={f.ruta}>
                {f.carpeta ? `${f.carpeta.split("/").pop()} › ` : ""}{f.nombre}
              </span>
              {/* Los dos pesos: es el único dato que dice cuál es "el nuevo". */}
              <span className="shrink-0 font-mono tabular-nums text-[var(--text-tertiary)]">
                {bytesLegibles(f.sizeExistente)} → {bytesLegibles(f.size)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
