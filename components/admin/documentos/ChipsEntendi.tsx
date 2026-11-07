"use client";

/**
 * «Entendí: vence este mes · contratos · texto: local» bajo el buscador del
 * Archivo. Muestra cómo se leyó la búsqueda («Buscar como hablas») y cada
 * parte trae su ✕: la búsqueda se reescribe sin esa parte.
 *
 * Se calcula acá con la MISMA función pura que usa el servidor
 * (`interpretarBusqueda`) y las carpetas que la pantalla ya tiene, así no hace
 * falta tocar el hook del listado ni esperar a la respuesta para dibujarlo.
 */

import { useMemo } from "react";
import { CalendarClock, FileText, Folder, Hash, MessageCircle, Search, Star, Upload, X, type LucideIcon } from "@buleje/design-system/icons";
import {
  entendioAlgo,
  interpretarBusqueda,
  type CarpetaBuscable,
  type TipoEntendi,
} from "@/lib/documentos/busqueda-natural";
import { cn } from "@/lib/utils";

interface Props {
  /** La búsqueda ya asentada (la misma que va al servidor). */
  busqueda: string;
  carpetas: readonly CarpetaBuscable[];
  /** Reescribe la búsqueda (la ✕ de un chip). */
  onCambiar: (nueva: string) => void;
}

const ICONO: Record<TipoEntendi, LucideIcon> = {
  vence: CalendarClock,
  subido: Upload,
  papel: Hash,
  tipo: FileText,
  origen: MessageCircle,
  favoritos: Star,
  carpeta: Folder,
  texto: Search,
};

const TONO: Partial<Record<TipoEntendi, string>> = {
  vence: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15",
  texto: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

export default function ChipsEntendi({ busqueda, carpetas, onCambiar }: Props) {
  const { chips, soloRelleno } = useMemo(() => {
    const r = interpretarBusqueda(busqueda, { carpetas });
    return { chips: entendioAlgo(r) ? r.entendi : [], soloRelleno: r.soloRelleno };
  }, [busqueda, carpetas]);

  // Todo era relleno («de la»): el servidor muestra la vista normal; se dice por qué.
  if (soloRelleno) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]" role="status">
        <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        No entendí nada concreto: se muestra todo. Prueba con «contratos», «vencidos» o «de ayer».
      </p>
    );
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cómo se entendió la búsqueda">
      <span className="text-sm font-bold text-[var(--text-tertiary)]">Entendí:</span>
      {chips.map((c, i) => {
        const Icono = ICONO[c.tipo];
        return (
          <span
            key={`${c.tipo}-${c.texto}-${i}`}
            className={cn(
              "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-xl pl-3 pr-1 text-sm font-semibold",
              TONO[c.tipo] ?? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
            )}
          >
            <Icono className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{c.texto}</span>
            <button
              type="button"
              onClick={() => onCambiar(c.sinEsto)}
              aria-label={`Quitar «${c.texto}» de la búsqueda`}
              title="Quitar de la búsqueda"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </span>
        );
      })}
    </div>
  );
}
