"use client";

import { Kicker } from "@buleje/design-system";
import { useMembrete } from "@/hooks/use-membrete";
import { logoParaHoja } from "@/lib/documentos/hoja-negocio";
import { datosDelMembrete } from "@/lib/documentos/membrete-pdf";

/**
 * Cabecera del negocio para lo que se imprime con `window.print()` desde la
 * propia página (cierre del día, declaración): logo, nombre, RUC · dirección y,
 * a la derecha, el tipo de documento con su fecha. Es la misma ficha que el
 * membrete de los PDF (ADR-514). Va dentro de un bloque que sólo se ve al
 * imprimir (`hidden print:block`); en pantalla no se usa.
 */
export function MembreteImpreso({
  tipo, codigo, fecha, extra, negocio,
}: { tipo: string; codigo?: string | null; fecha?: string | null; extra?: string | null; negocio?: string }) {
  const membrete = useMembrete();
  // `negocio` = el nombre que la pantalla ya conoce, por si el membrete aún no llegó.
  const d = datosDelMembrete(membrete?.nombre || !negocio ? membrete : { ...membrete, nombre: negocio }, { tipo, codigo, fecha, extra });
  const logo = logoParaHoja(membrete);
  return (
    <header className="flex items-center gap-4 border-b-2 border-[var(--accent-dark)] pb-3">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- hoja impresa: el logo del negocio, sin optimizador
        <img src={logo} alt="" className="h-16 max-w-44 object-contain" />
      ) : (
        <div aria-hidden className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--accent-dark)] text-3xl font-bold text-white">
          {d.monograma}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold leading-tight text-[var(--text-primary)]">{d.titulo}</p>
        {d.razonSocial && <p className="text-xs text-[var(--text-secondary)]">{d.razonSocial}</p>}
        {d.datos.length > 0 && <p className="text-xs text-[var(--text-tertiary)]">{d.datos.join(" · ")}</p>}
      </div>
      <div className="text-right">
        <Kicker className="block text-[var(--accent-dark)]">{d.tipo}</Kicker>
        {d.codigo && <p className="text-base font-bold text-[var(--text-primary)]">{d.codigo}</p>}
        {d.fecha && <p className="text-xs text-[var(--text-secondary)]">{d.fecha}</p>}
        {d.extra && <p className="text-xs text-[var(--text-tertiary)]">{d.extra}</p>}
      </div>
    </header>
  );
}
