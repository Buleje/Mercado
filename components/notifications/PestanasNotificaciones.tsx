"use client";

/**
 * Las categorías del centro de notificaciones (sólo las que tienen algo, más
 * la elegida) y «No leídas».
 *
 * - Desde md: columna a la izquierda de la lista, una fila de 48 px por
 *   categoría con su conteo a la derecha (como una bandeja de correo). En una
 *   fila no entraban: 6 categorías + «No leídas» piden ~990 px.
 * - En celular: una sola fila que se desliza de costado, fija sobre la lista;
 *   «No leídas» queda a la derecha.
 *
 * Rediseño 18-10: sin aro ni bordes. La elegida se tiñe de turquesa; los
 * conteos van chicos y grises; «No leídas» es un interruptor (sigue siendo un
 * botón con `aria-pressed`).
 */
import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CATEGORIAS, type FiltroCategoria } from "./notificaciones-categorias";

/** Una pestaña que va ANTES de «Todas» (el centro único pone «Por hacer»). */
export interface PestanaExtra {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  /** Una `FiltroCategoria` o el id de una `primeras`. */
  categoria: string;
  onCategoria: (c: string) => void;
  /** Cuántos hay por categoría (y en `todas`). */
  conteos: Readonly<Record<string, number>>;
  soloSinLeer: boolean;
  onSoloSinLeer: (v: boolean) => void;
  /** El ⓘ de la vista, al final. */
  ayuda?: ReactNode;
  primeras?: readonly PestanaExtra[];
  /** Siempre en una fila que se desliza (la barra del costado es angosta aunque la pantalla sea ancha). */
  enFila?: boolean;
}

const PESTANA =
  "inline-flex h-12 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] md:w-full";
const ELEGIDA = "bg-[var(--accent)]/10 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]";
const LIBRE =
  "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

export default function PestanasNotificaciones({
  categoria,
  onCategoria,
  conteos,
  soloSinLeer,
  onSoloSinLeer,
  ayuda,
  primeras = [],
  enFila = false,
}: Props) {
  const opciones: PestanaExtra[] = [
    ...primeras,
    { id: "todas", label: "Todas", icon: Inbox },
    ...CATEGORIAS.filter((c) => (conteos[c.id] ?? 0) > 0 || c.id === categoria),
  ];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-[var(--rule-soft)] py-1.5",
        enFila ? "px-3" : "px-5 sm:px-6 md:w-56 md:flex-col md:items-stretch md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-3",
      )}
    >
      <div
        role="group"
        aria-label="Categoría"
        className={cn(
          "flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          enFila
            ? "[mask-image:linear-gradient(to_right,black_85%,transparent)]"
            : "max-md:[mask-image:linear-gradient(to_right,black_85%,transparent)] md:flex-none md:flex-col md:gap-0.5 md:overflow-visible",
        )}
      >
        {opciones.map((o) => {
          const elegida = o.id === categoria;
          const n = conteos[o.id] ?? 0;
          const Icono = o.icon;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={elegida}
              onClick={() => onCategoria(o.id)}
              className={cn(PESTANA, enFila && "!w-auto", elegida ? ELEGIDA : LIBRE)}
            >
              <Icono className="h-4 w-4 shrink-0" strokeWidth={elegida ? 2.25 : 1.75} aria-hidden />
              <span className={cn(!enFila && "md:min-w-0 md:flex-1 md:truncate md:text-left")}>{o.label}</span>
              {n > 0 && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    elegida ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-tertiary)]",
                  )}
                >
                  {n > 99 ? "99+" : n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className={cn("flex shrink-0 items-center gap-1", !enFila && "md:mt-2 md:border-t md:border-[var(--rule-soft)] md:pt-2")}>
        <button
          type="button"
          aria-pressed={soloSinLeer}
          onClick={() => onSoloSinLeer(!soloSinLeer)}
          title="Sólo las no leídas"
          className={cn(PESTANA, LIBRE, enFila ? "!w-auto px-2" : "md:flex-1", soloSinLeer && "text-[var(--text-primary)]")}
        >
          <span
            aria-hidden
            className={cn(
              "relative h-5 w-8 shrink-0 rounded-full transition-colors",
              soloSinLeer ? "bg-[var(--accent)]" : "bg-[var(--rule-strong)]/25 dark:bg-[var(--rule-strong)]",
            )}
          >
            <span
              className={cn(
                "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform",
                soloSinLeer && "translate-x-3",
              )}
            />
          </span>
          <span className={cn(enFila && "sr-only")}>No leídas</span>
        </button>
        {ayuda}
      </div>
    </div>
  );
}
