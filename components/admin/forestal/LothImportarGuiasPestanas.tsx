"use client";

/**
 * La barra de pestañas de una guía en la vista previa de «Importar guías
 * despachadas» (Brandon 07-10-2026: «2 secciones separadas: los datos como
 * destinatario, propietario y otros, y el detalle de trozas, lista y
 * resúmenes; y el directorio en otra sección»).
 *
 * A diferencia de `CtpApartados`, puede no haber pestaña abierta: con muchas
 * guías la tarjeta arranca plegada (la barra ya resume cada sección con su
 * cifra) y un clic en la pestaña activa la vuelve a plegar.
 * `role="tablist"/"tab"`, foco itinerante y ←/→/Inicio/Fin (mueven el foco Y
 * abren). A 400 px la barra scrollea en horizontal en vez de envolver.
 */

import { useRef, type KeyboardEvent } from "react";

export interface PestanaGuia {
  id: string;
  label: string;
  /** La cifra del rótulo («46 trozas», «2 nuevos · 2 se guardan»). */
  cifra?: string;
}

export const idPestana = (base: string, id: string) => `${base}-pestana-${id}`;
export const idPanelPestana = (base: string, id: string) => `${base}-panel-${id}`;

export default function LothImportarGuiasPestanas({
  pestanas,
  activa,
  onElegir,
  idBase,
  etiqueta,
}: {
  pestanas: readonly PestanaGuia[];
  /** `null`: la tarjeta está plegada (sólo la barra). */
  activa: string | null;
  onElegir: (id: string | null) => void;
  idBase: string;
  etiqueta: string;
}) {
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());
  /* Plegada, el Tab entra por la primera pestaña. */
  const conFoco = activa ?? pestanas[0]?.id;

  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = pestanas.length;
    const destino =
      e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowLeft"
          ? (i - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (destino == null) return;
    e.preventDefault();
    const p = pestanas[destino];
    onElegir(p.id);
    refs.current.get(p.id)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className="flex gap-1 overflow-x-auto border-t border-[var(--rule-soft)] px-2 [scrollbar-width:thin]"
    >
      {pestanas.map((p, i) => {
        const esActiva = p.id === activa;
        return (
          <button
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
            type="button"
            role="tab"
            id={idPestana(idBase, p.id)}
            aria-selected={esActiva}
            aria-expanded={esActiva}
            aria-controls={esActiva ? idPanelPestana(idBase, p.id) : undefined}
            tabIndex={p.id === conFoco ? 0 : -1}
            onClick={() => onElegir(esActiva ? null : p.id)}
            onKeyDown={(e) => alTeclear(e, i)}
            className={`-mb-px flex min-h-11 shrink-0 items-center gap-x-1.5 whitespace-nowrap border-b-2 px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
              esActiva
                ? "border-[var(--accent)] font-bold text-[var(--text-primary)]"
                : "border-transparent font-semibold text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)]"
            }`}
          >
            {p.label}
            {p.cifra && (
              <>
                <span className="sr-only">,</span>
                <span
                  title={p.cifra}
                  className="max-w-[16rem] truncate rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--text-secondary)]"
                >
                  {p.cifra}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
