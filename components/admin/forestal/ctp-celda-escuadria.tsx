"use client";

/**
 * La celda MEDIDAS de un paquete: lo que mide y si eso cuadra con su volumen.
 *
 * Vivía como un `—` mudo en 27 de los 33 paquetes del libro real de Blas. Un
 * guion no dice si falta cargarlo o si el paquete no se dimensiona: acá el vacío
 * es una **puerta** («Cargar medidas») y lo cargado trae al lado el veredicto
 * del cuadre, que es el único que puede decir que el volumen declarado está mal.
 *
 * Se extrae de `CtpProductosDisponibles` a propósito: esa pantalla ya pasa las
 * 1.300 líneas y esta misma celda se repite en la ficha del paquete.
 */

import { AlertTriangle, Check, Ruler } from "@buleje/design-system/icons";
import {
  cuadreDeEscuadria,
  escuadriaCompleta,
  fmtEscuadria,
  type CuadreDeEscuadria,
  type EstadoCuadre,
} from "@/lib/forestal/escuadria-del-paquete";

const m3_4 = (v: number) =>
  v.toLocaleString("es-PE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export interface PaqueteConEscuadria {
  codigo: string;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
}

/** Sólo los dos estados que piden mirar la fila llevan pastilla. */
const PASTILLA: Partial<Record<EstadoCuadre, { texto: string; clase: string }>> = {
  "no-cuadra": {
    texto: "No cuadra",
    clase:
      "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  },
  "sin-piezas": {
    texto: "Sin piezas",
    clase:
      "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
};

export function CeldaEscuadria({
  paquete,
  onEditar,
}: {
  /** `null` = la fila es una corrida sin paquetes: no hay escuadría que cargar. */
  paquete: PaqueteConEscuadria | null;
  onEditar: () => void;
}) {
  if (!paquete) return <span className="text-[var(--text-tertiary)]">—</span>;

  const cuadre = cuadreDeEscuadria(paquete);
  const pastilla = PASTILLA[cuadre.estado];

  if (!escuadriaCompleta(paquete)) {
    return (
      <button
        type="button"
        onClick={onEditar}
        title={`Cargar espesor, ancho y largo de ${paquete.codigo} — sin ellos su volumen no se puede recalcular`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-sans text-sm font-bold text-[var(--accent-dark)] underline decoration-dotted underline-offset-4 transition-colors hover:bg-[var(--accent-soft)] dark:text-[var(--accent)]"
      >
        <Ruler className="h-4 w-4 shrink-0" aria-hidden /> Cargar medidas
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onEditar}
      title={`${cuadre.texto} Toca para corregir la escuadría de ${paquete.codigo}.`}
      className="inline-flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl px-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
    >
      <span className="font-mono text-xs text-[var(--text-secondary)]">
        {fmtEscuadria(paquete)}
      </span>
      {pastilla ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-sans text-[length:var(--ts-2xs)] font-bold ${pastilla.clase}`}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> {pastilla.texto}
        </span>
      ) : cuadre.estado === "cuadra" ? (
        <Check
          className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          aria-label="El volumen declarado cuadra con sus medidas"
        />
      ) : null}
    </button>
  );
}

/**
 * Los dos volúmenes, uno al lado del otro.
 *
 * Es el corazón de «que el volumen y las medidas cierren entre sí»: lo que el
 * asiento declara, lo que dan las medidas, y la diferencia. Nunca se pisa uno
 * con el otro — el libro es un documento oficial y el que midió la pila es
 * quien sabe cuál de los dos está mal.
 */
export function PanelDeCuadre({
  cuadre,
  declaradoM3,
}: {
  cuadre: CuadreDeEscuadria;
  declaradoM3: number;
}) {
  const malo = cuadre.estado === "no-cuadra";
  const bueno = cuadre.estado === "cuadra";
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        malo
          ? "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10"
          : bueno
            ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10"
            : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
      }`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Cifra rotulo="Declara el asiento" valor={`${m3_4(declaradoM3)} m³`} />
        <Cifra
          rotulo="Dan sus medidas"
          valor={cuadre.calculadoM3 != null ? `${m3_4(cuadre.calculadoM3)} m³` : "—"}
        />
        <Cifra
          rotulo="Diferencia"
          valor={cuadre.diferenciaM3 != null ? `${m3_4(cuadre.diferenciaM3)} m³` : "—"}
        />
      </div>
      <p
        className={`mt-2 flex items-start gap-1.5 text-sm ${
          malo
            ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
            : bueno
              ? "font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              : "text-[var(--text-secondary)]"
        }`}
      >
        {malo ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : bueno ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : null}
        <span>{cuadre.texto}</span>
      </p>
      {cuadre.aviso && (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{cuadre.aviso.sugerencia}</p>
      )}
    </div>
  );
}

function Cifra({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {rotulo}
      </p>
      <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
        {valor}
      </p>
    </div>
  );
}
