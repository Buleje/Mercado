"use client";

/**
 * «Declarar: [WASACO · 40 pzas · 120 PT] [Sin dueño · 18 pzas · 64 PT]» —
 * el selector de dueño de «Declarar producción» cuando la libreta trae piezas
 * de dos dueños o más (Brandon, 2026-09-23: «que proponga 2 registros solos»).
 *
 * Se declara uno a la vez: el resumen, los paquetes y el cobro de abajo son
 * sólo de las piezas del elegido. Lo que dice debajo es de dónde sale el
 * servicio propuesto, para que no parezca elegido por nadie.
 */
import { useEffect, useRef } from "react";
import { CheckCircle2, Users, X } from "@buleje/design-system/icons";
import { fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaDeGrupo, type GrupoDeDueno } from "@/lib/forestal/declarar-por-dueno";

export default function CtpGruposDeDueno({
  grupos,
  clave,
  onElegir,
  propuestaVigente,
}: {
  grupos: readonly GrupoDeDueno[];
  clave: string | null;
  onElegir: (clave: string) => void;
  /** El servicio del borrador sigue siendo el que propuso el dueño (aserrío a su cuenta). */
  propuestaVigente: boolean;
}) {
  const elegido = grupos.find((g) => g.clave === clave) ?? null;
  const otros = grupos.filter((g) => g !== elegido).map(etiquetaDeGrupo);
  return (
    <fieldset className="mb-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <legend className="sr-only">Qué dueño se declara</legend>
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]"
        >
          <Users className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden /> Declarar:
        </span>
        {grupos.map((g) => {
          const activo = g.clave === clave;
          return (
            <label
              key={g.clave}
              className={`inline-flex min-h-11 cursor-pointer flex-wrap items-center gap-x-1.5 rounded-xl border-2 px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-[var(--accent-muted)] ${
                activo
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
              }`}
            >
              <input
                type="radio"
                name="grupo-de-dueno"
                value={g.clave}
                checked={activo}
                onChange={() => onElegir(g.clave)}
                className="sr-only"
              />
              <span className={`font-semibold ${g.nombre ? "" : "italic"}`}>{etiquetaDeGrupo(g)}</span>
              <span className="whitespace-nowrap tabular-nums">
                · {fmtPiezas(g.cantidad)} {g.cantidad === 1 ? "pza" : "pzas"} · {fmtPt(g.pt)} PT
              </span>
            </label>
          );
        })}
      </div>
      {elegido && (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {elegido.parteId
            ? propuestaVigente
              ? `Propuesto por las piezas: aserrío a la cuenta de ${etiquetaDeGrupo(elegido)} (su ficha del Directorio). Puedes cambiarlo abajo.`
              : `Las piezas son de ${etiquetaDeGrupo(elegido)}; el servicio de abajo lo elegiste tú.`
            : elegido.nombre
              ? `${elegido.nombre} no tiene ficha en el Directorio: elige el servicio y la cuenta abajo.`
              : "Estas piezas no tienen dueño: elige el servicio abajo."}{" "}
          Al registrar, sólo estas piezas salen de la libreta; {otros.join(" y ")}{" "}
          {otros.length === 1 ? "queda" : "quedan"} para el siguiente registro.
        </p>
      )}
    </fieldset>
  );
}

/**
 * Ya se registró un dueño y queda otro: se dice qué quedó en el Libro.
 *
 * Se trae a la vista al aparecer: el botón «Registrar» está abajo y el cuerpo
 * del modal queda donde estaba (en la sección del asiento) — medido en QA el
 * 23-09, el aviso nacía arriba, fuera de la pantalla, y nadie lo veía.
 */
export function AvisoDuenoRegistrado({ mensaje, onCerrar }: { mensaje: string; onCerrar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [mensaje]);
  return (
    <div
      ref={ref}
      className="mb-4 flex scroll-mt-4 items-start gap-3 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2.5"
    >
      <CheckCircle2
        className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
        aria-hidden
      />
      <p role="status" className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
        {mensaje}
      </p>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar aviso"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
