"use client";

/**
 * ctp-ficha-form — lo que comparten las secciones del formulario de la Ficha
 * del CTP (`CtpFichaFormIdentidad`, `…Titulos`, `…Ubicacion`).
 *
 * El editor se partió cuando pasó de 21 a 27 campos: un solo archivo con la
 * carátula del Libro, los títulos habilitantes, los permisos CITES y la
 * ubicación no entraba en las 300 líneas que pide el estándar del repo. Acá
 * vive únicamente lo común; cada sección es dueña de sus campos.
 */

import type { ComponentType, ReactNode } from "react";
import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";

/** Escribe un campo del borrador. Cada sección recibe esto, no el `setState`. */
export type SetCampoFicha = <K extends keyof CtpFicha>(k: K, v: CtpFicha[K]) => void;

/** Props que toda sección del formulario recibe igual. */
export interface CamposFichaProps {
  draft: CtpFicha;
  set: SetCampoFicha;
}

/** Un bloque del formulario: título con ícono + grilla de dos columnas. */
export function BloqueCampos({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  /** Una línea de contexto: de qué formato oficial salen estos campos. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />}
        <span className="text-sm font-bold text-[var(--text-primary)]">{title}</span>
      </div>
      {hint && <p className="mb-2.5 text-sm text-[var(--text-tertiary)]">{hint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Aviso inline de un campo (no bloquea el guardado, sólo avisa). */
export function NotaCampo({
  tono,
  icono: Icono,
  children,
}: {
  tono: "ok" | "aviso" | "error";
  icono: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: ReactNode;
}) {
  const clase =
    tono === "ok"
      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : tono === "aviso"
        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
  return (
    <p className={`mt-1.5 flex items-start gap-1.5 text-sm font-medium ${clase}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
