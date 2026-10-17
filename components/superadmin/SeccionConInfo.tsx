"use client";

/**
 * SeccionConInfo — título de sección + ⓘ hermano + acciones a la derecha.
 *
 * Reemplaza el `description` de `AdminSection` (un párrafo bajo el título):
 * a la vista queda el título y la ayuda vive en el InfoTip, como hermano y
 * NUNCA dentro del `<h2>` (guard `__tests__/infotip-no-anidado.test.ts`).
 */

import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip, type InfoTipProps } from "@/components/superadmin/_shared/InfoTip";

interface SeccionConInfoProps {
  title: string;
  /** Contenido del ⓘ. Si se omite, no hay ícono. */
  info?: Pick<InfoTipProps, "what" | "affects" | "example" | "body">;
  /** Botones o filtros a la derecha del título. */
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function SeccionConInfo({ title, info, actions, className, children }: SeccionConInfoProps) {
  return (
    <section className={["space-y-4", className].filter(Boolean).join(" ")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <SectionTitle>{title}</SectionTitle>
          {info && <InfoTip title={title} side="bottom" {...info} />}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
