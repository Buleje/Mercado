"use client";

/**
 * Interruptor — el ÚNICO switch del panel (contrato de diseño, ADR-489).
 *
 * Sale del `Toggle` de Ajustes (`components/admin/settings/campos.tsx`), que
 * ahora lo reexporta con los mismos props: la fila (etiqueta + descripción +
 * interruptor sobre fondo hundido) se ve donde se veía. Lo que cambia:
 * - `role="switch"` + `aria-checked`: antes era un botón con `aria-pressed` y el
 *   lector decía «botón, presionado» en vez de «interruptor, activado».
 * - Apagado se ve: riel con borde y perilla en `--text-tertiary` (≥ 3:1 contra
 *   el fondo; el gris-300 de antes daba ~1,4:1).
 * - Toda la etiqueta prende y apaga (es un `<label>` del botón) y el botón mide
 *   lo que un control del panel (`ALTURA_CONTROL`, 48 px) sin mover la fila
 *   (`-my-3` = (48 − 24) / 2).
 * - `disabled`, y `variante="solo"` para el interruptor suelto en una fila de
 *   tabla o una cabecera (la etiqueta queda en `aria-label`). Deshabilitado, la
 *   fila atenúa sólo la etiqueta: el botón ya lo atenúa el panel (0,6) y antes
 *   las dos opacidades se multiplicaban (0,36).
 */
import { useId } from "react";
import { cn } from "@/lib/utils";
import { ALTURA_CONTROL } from "./button-variants";

export interface InterruptorProps {
  /** Encendido o apagado. */
  enabled: boolean;
  onChange: (v: boolean) => void;
  /** Lo que se prende. Es el nombre que lee el lector de pantalla. */
  label: string;
  /** Una línea debajo de la etiqueta (sólo en `variante="fila"`). */
  desc?: React.ReactNode;
  /** Encendido en rojo: para lo que corta algo (modo mantenimiento). */
  danger?: boolean;
  disabled?: boolean;
  /** `fila` (por defecto): la tarjeta de Ajustes. `solo`: sólo el interruptor. */
  variante?: "fila" | "solo";
  id?: string;
  className?: string;
}

function Riel({ enabled, danger }: { enabled: boolean; danger?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-[var(--dur-fast)]",
        "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[var(--accent)]",
        enabled
          ? danger
            ? "bg-[var(--data-error-500)]"
            : "bg-primary"
          : "bg-[var(--surface-raised)] ring-1 ring-inset ring-[var(--text-tertiary)]",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 rounded-full transition-[transform,width,height,background-color] duration-[var(--dur-fast)] ease-[var(--ease-editorial)]",
          enabled
            ? "h-5 w-5 translate-x-5 bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
            : "ml-0.5 h-4 w-4 bg-[var(--text-tertiary)]",
        )}
      />
    </span>
  );
}

export function Interruptor({
  enabled,
  onChange,
  label,
  desc,
  danger,
  disabled,
  variante = "fila",
  id,
  className,
}: InterruptorProps) {
  const propio = useId();
  const idBoton = id ?? `interruptor-${propio}`;
  const idDesc = desc ? `${idBoton}-desc` : undefined;

  const boton = (
    <button
      id={idBoton}
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      aria-describedby={variante === "fila" ? idDesc : undefined}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "group relative inline-flex shrink-0 items-center justify-center rounded-full focus-visible:outline-none",
        ALTURA_CONTROL.clase,
        "disabled:cursor-not-allowed disabled:opacity-50",
        variante === "fila" ? "-my-3" : className,
      )}
    >
      <Riel enabled={enabled} danger={danger} />
    </button>
  );

  if (variante === "solo") return boton;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
        className,
      )}
    >
      <label htmlFor={idBoton} className={cn("flex-1 min-w-0", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        {desc && (
          <span id={idDesc} className="mt-0.5 block text-xs text-[var(--text-secondary)]">
            {desc}
          </span>
        )}
      </label>
      {boton}
    </div>
  );
}
