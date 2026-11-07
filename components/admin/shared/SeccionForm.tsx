"use client";

/**
 * Un bloque de un formulario largo: título con su regla y la grilla de campos.
 *
 * Nació en Recursos Humanos (`rrhh-form.tsx`, ADR-414) para separar «quién es /
 * contacto / trabajo» en vez de 13 campos seguidos, y subió acá cuando el alta
 * de adelanto lo necesitó (ADR-448): el mismo bloque, con dos agregados que
 * RRHH no usa y que por defecto no cambian un pixel allá:
 *
 *  - `numero`: el paso del formulario en una pastilla («1 ¿Quién pone la
 *    plata?»). Ordena la lectura de arriba abajo sin un wizard.
 *  - `info`: la explicación va a un ⓘ al lado del título, no a un párrafo
 *    (Brandon 24-09: «mucho texto por todos lados»).
 *
 * `titular="tarjeta"` sube el título a `CardTitle` para modales anchos, donde
 * el `BlockTitle` de 14 px se perdía («títulos chiquitos», alta de adelanto).
 */

import type { ReactNode } from "react";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { InfoTip, type InfoTipProps } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

export function SeccionForm({
  titulo,
  descripcion,
  children,
  columnas = 2,
  className,
  numero,
  info,
  accion,
  titular = "bloque",
  id,
}: {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  /** `"libre"`: sin grilla — el bloque arma su propia disposición. */
  columnas?: 1 | 2 | "libre";
  className?: string;
  /** El paso del formulario, en una pastilla antes del título. */
  numero?: number;
  /** La explicación del bloque, en un ⓘ al lado del título. */
  info?: Pick<InfoTipProps, "what" | "affects" | "example" | "body" | "icono">;
  /** A la derecha del título: plegar, un contador, una acción corta. */
  accion?: ReactNode;
  titular?: "bloque" | "tarjeta";
  /** Para que un `aria-labelledby` de afuera apunte al título. */
  id?: string;
}) {
  const Titulo = titular === "tarjeta" ? CardTitle : BlockTitle;
  const conCabecera = numero != null || info != null || accion != null;
  return (
    <section className={cn("min-w-0", className)} aria-labelledby={id}>
      <div
        className={cn(
          "mb-4 flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-[var(--rule-soft)] pb-2",
          conCabecera ? "items-center" : "items-baseline",
        )}
      >
        {conCabecera ? (
          <div className="flex min-w-0 items-center gap-2.5">
            {numero != null && (
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-sm font-extrabold tabular-nums text-[var(--accent-ink)]"
              >
                {numero}
              </span>
            )}
            <Titulo
              as="h3"
              id={id}
              className={titular === "tarjeta" ? "text-lg font-bold text-[var(--text-primary)]" : undefined}
            >
              {numero != null && <span className="sr-only">{`Paso ${numero}: `}</span>}
              {titulo}
            </Titulo>
            {info && <InfoTip title={titulo} side="bottom" {...info} />}
          </div>
        ) : (
          <BlockTitle as="h3">{titulo}</BlockTitle>
        )}
        {descripcion && <p className="text-xs text-[var(--text-tertiary)]">{descripcion}</p>}
        {accion && <div className="flex shrink-0 items-center gap-2">{accion}</div>}
      </div>
      {columnas === "libre" ? (
        children
      ) : (
        <div className={cn("grid grid-cols-1 gap-x-4 gap-y-4", columnas === 2 && "sm:grid-cols-2")}>{children}</div>
      )}
    </section>
  );
}
