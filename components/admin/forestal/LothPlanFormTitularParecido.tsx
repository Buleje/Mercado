"use client";

/**
 * «Parecido a … del Directorio — Usar el nombre del Directorio» bajo el
 * titular del plan (Brandon 24-10: «juntar escrituras de la comunidad»). La
 * misma comunidad escrita de dos formas («CCNN SAN LUIS DE CHINCHIGUANI» /
 * «COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI») son dos titulares para el libro
 * y uno solo para la ARFFS. No cambia nada solo: sugiere y la persona decide.
 *
 * El Directorio se lee recién al llegar al paso del titular con algo escrito.
 * Reglas: `lib/forestal/titular-parecido.ts`.
 */

import { useEffect, useMemo, useState } from "react";
import { Users } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { titularParecido } from "@/lib/forestal/titular-parecido";

export default function LothPlanFormTitularParecido({ escrito, activo, onUsar }: {
  escrito: string;
  activo: boolean;
  onUsar: (nombre: string) => void;
}) {
  /* Una sola lectura: una vez pedida, no se vuelve a pedir al borrar y reescribir o al cambiar de paso. */
  const [leido, setLeido] = useState(activo);
  useEffect(() => {
    if (activo) setLeido(true);
  }, [activo]);
  const { partes } = useDirectorioForestal({ activo: leido || activo });
  const parecido = useMemo(
    () => (activo ? titularParecido(escrito, partes.filter((p) => p.activo), (p) => p.nombre) : null),
    [activo, escrito, partes],
  );
  if (!parecido || parecido.identico) return null;
  return (
    <div
      data-titular-parecido
      className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--data-info-100)] bg-[var(--data-info-50)] px-3 py-2 text-sm text-[var(--text-primary)] lg:col-span-4 dark:border-[var(--data-info-500)]/30 dark:bg-[var(--data-info-500)]/10"
    >
      <span className="flex min-w-0 grow basis-[16rem] items-center gap-2">
        <Users className="h-4 w-4 shrink-0 text-[var(--data-info-ink)]" aria-hidden="true" />
        <span className="min-w-0">
          Parecido a <strong>«{parecido.nombre}»</strong> del Directorio. Si es la misma, usa un solo nombre: así el libro no la
          cuenta como dos titulares.
        </span>
      </span>
      <button
        type="button"
        onClick={() => onUsar(parecido.nombre)}
        className={button({ variant: "secondary", className: "shrink-0 rounded-xl" })}
      >
        Usar el nombre del Directorio
      </button>
    </div>
  );
}
