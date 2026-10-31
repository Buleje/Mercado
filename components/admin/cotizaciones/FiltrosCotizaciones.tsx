"use client";

/**
 * La fila de filtros pegada a la lista: buscador · estado (con su cuenta) ·
 * cómo se ve (lista o tarjetas). Todo a 48 px y 14 px, en UNA fila desde `lg`.
 *
 * Las cuentas de los chips son el embudo de antes (cuántas hay en cada
 * estado): el mismo dato, donde además sirve para filtrar.
 */
import { LayoutGrid, List, Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { SECCION, STATUS_META, type CotizacionStatus, type SeccionCotizaciones } from "./tipos";

export type VistaLista = "lista" | "cards";

interface Props {
  seccion: SeccionCotizaciones;
  texto: string;
  onTexto: (t: string) => void;
  estado: CotizacionStatus | "";
  onEstado: (e: CotizacionStatus | "") => void;
  /** Cuántas hay por estado (sobre la lista entera, no sobre la filtrada). */
  cuentas: Partial<Record<CotizacionStatus, number>>;
  vista: VistaLista;
  onVista: (v: VistaLista) => void;
}

const CHIP = "inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors";
const CHIP_ON = "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

export function FiltrosCotizaciones({ seccion, texto, onTexto, estado, onEstado, cuentas, vista, onVista }: Props) {
  const estados = SECCION[seccion].estados;
  /* «Todas» va sin cuenta: es la de la sección, que ya está en su pestaña. */
  const chips: { clave: CotizacionStatus | ""; rotulo: string; cuenta?: number }[] = [
    { clave: "", rotulo: "Todas" },
    ...estados.map((e) => ({ clave: e, rotulo: STATUS_META[e].plural, cuenta: cuentas[e] ?? 0 })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
      <label className="relative min-w-0 grow basis-full sm:basis-60">
        <span className="sr-only">Buscar cotizaciones</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          placeholder="Buscar por cliente o N°…"
          className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
        />
      </label>

      <div role="group" aria-label="Filtrar por estado" className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto scrollbar-none">
        {chips.map((c) => (
          <button
            key={c.clave || "todas"}
            type="button"
            aria-pressed={estado === c.clave}
            onClick={() => onEstado(c.clave)}
            className={cn(CHIP, estado === c.clave ? CHIP_ON : CHIP_OFF)}
          >
            {c.rotulo}
            {c.cuenta != null && <span className="tabular-nums text-[var(--text-secondary)]">{c.cuenta}</span>}
          </button>
        ))}
      </div>

      {/* Debajo de `sm` la tabla ya se dibuja como tarjetas: el selector no cambiaría nada. */}
      <div role="group" aria-label="Cómo se ve la lista" className="ml-auto flex shrink-0 gap-1 max-sm:hidden">
        {([
          ["lista", List, "Ver como lista"],
          ["cards", LayoutGrid, "Ver como tarjetas"],
        ] as const).map(([v, Icono, rotulo]) => (
          <button
            key={v}
            type="button"
            aria-pressed={vista === v}
            aria-label={rotulo}
            title={rotulo}
            onClick={() => onVista(v)}
            className={cn(CHIP, "w-12 justify-center px-0", vista === v ? CHIP_ON : CHIP_OFF)}
          >
            <Icono className="h-4 w-4" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
