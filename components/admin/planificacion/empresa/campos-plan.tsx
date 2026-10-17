"use client";

/**
 * Piezas de formulario del plan de la empresa (ADR-497, carril A): el campo
 * con su rótulo y su ⓘ al lado, el texto largo que crece y las clases de los
 * controles. Las usan Empresa y Socios e inversión.
 */
import { useId, type ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { NOMBRES_MES, etiquetaDia } from "@/lib/rrhh/fechas";
import { cn } from "@/lib/utils";

/** Input y select a 48 px, como el resto del panel. */
export const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)] disabled:opacity-80";

export const CAMPO_AREA = cn(CAMPO, "h-auto min-h-24 resize-y py-2.5 leading-relaxed");

const ROTULO = "text-xs font-semibold text-[var(--text-secondary)]";

interface CampoProps {
  rotulo: string;
  /** Qué va acá (dentro del ⓘ). */
  ayuda?: ReactNode;
  ejemplo?: ReactNode;
  className?: string;
  children: (id: string) => ReactNode;
}

/** Rótulo + ⓘ arriba del control; el ⓘ va al lado del `<label>`, nunca adentro. */
export function Campo({ rotulo, ayuda, ejemplo, className, children }: CampoProps) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center gap-1">
        <label htmlFor={id} className={ROTULO}>
          {rotulo}
        </label>
        {ayuda ? <InfoTip title={rotulo} what={ayuda} example={ejemplo} /> : null}
      </div>
      {children(id)}
    </div>
  );
}

/** Lee un número de soles de un input; vacío o inválido = null. */
export function leerSoles(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100) / 100;
}

/** «jueves 10/09» (con el año si no es el de hoy); vacío = «—». */
export function fechaCorta(key: string, hoy: string): string {
  return key ? etiquetaDia(key, hoy) : "—";
}

/** «diciembre de 2027»: el mes al que se llega sumando `meses` a hoy. Meses escritos a mano, no Intl. */
export function mesDentroDe(hoy: string, meses: number): string {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7)) - 1 + meses;
  return `${NOMBRES_MES[((mes % 12) + 12) % 12]} de ${anio + Math.floor(mes / 12)}`;
}

/** «1 socio», «3 socios». */
export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}
