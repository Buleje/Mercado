import type { ReactNode } from "react";
import { PageTitle } from "@buleje/design-system";
import { TreePine } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { SUPERADMIN_HERO, SUPERADMIN_HERO_INNER } from "@/lib/superadmin-layout";

interface Props {
  titulo: string;
  what: string;
  affects?: string;
  example?: ReactNode;
}

/** Cabecera de las pantallas de Plantas forestales (el título manda; la ayuda va en el ⓘ). */
export function CabeceraPlantas({ titulo, what, affects, example }: Props) {
  return (
    <header className={SUPERADMIN_HERO}>
      <div className={SUPERADMIN_HERO_INNER}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--accent)] sm:h-12 sm:w-12">
            <TreePine className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">Plataforma · Forestal</p>
            <div className="inline-flex flex-wrap items-center gap-2">
              <PageTitle>{titulo}</PageTitle>
              <InfoTip side="bottom" title={titulo} what={what} affects={affects} example={example} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
