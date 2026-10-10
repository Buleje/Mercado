"use client";

/**
 * Menú de secciones y cabecera de Ajustes (`?tab=config&vista=<id>`).
 *
 * Salieron de `SettingsModule` al aplicarle la ley de la vista (2026-10-08,
 * `.claude/rules/ui-components.md`): la sección tiene UN título que manda
 * (`SectionTitle`), su explicación va en un ⓘ y lo que falta completar es un
 * solo botón con menú — antes era una franja de hasta 8 chips arriba del
 * formulario, que sumaba un botón por dato y empujaba todo hacia abajo.
 */
import { cn } from "@/lib/utils";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, CircleDot, Search, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { GRUPOS_AJUSTES, type SeccionAjustes, type SeccionMeta } from "./secciones";

/** Un dato que falta: `id` del campo al que se salta; `antes` lo crea si todavía no existe (la 1.ª zona de delivery). */
export type FaltaItem = { id: string; label: string; antes?: () => void };

type Pendientes = Partial<Record<SeccionAjustes, number>>;

interface MenuProps {
  secciones: readonly SeccionMeta[];
  activa: SeccionAjustes;
  pendientes: Pendientes;
  onIr: (id: SeccionAjustes) => void;
}

function Contador({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn("shrink-0 rounded-full border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]", className)}
      title={`Te faltan ${n} datos`}
    >
      {n}
    </span>
  );
}

/**
 * El buscador de ajustes. Vive en la banda de identidad de Configuración
 * (antes, dentro del encabezado viejo); Enter salta a la primera sección que
 * coincide. 48 px de alto, como todo filtro del panel (decisión de Brandon).
 */
export function BuscadorAjustes({ valor, onCambiar, onIrAPrimera }: {
  valor: string;
  onCambiar: (v: string) => void;
  onIrAPrimera: () => void;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
      <input
        type="search"
        aria-label="Buscar un ajuste"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onIrAPrimera(); }}
        placeholder="Buscar: yape, igv, logo…"
        className="w-full pl-9 pr-11 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
      />
      {valor && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onCambiar("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Celular: las secciones en una fila que se desliza. */
export function MenuSeccionesMovil({ secciones, activa, pendientes, onIr }: MenuProps) {
  return (
    <nav aria-label="Secciones de configuración" className="lg:hidden flex gap-2 overflow-x-auto pb-1">
      {secciones.map((s) => {
        const Icon = s.icon;
        const esta = s.id === activa;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onIr(s.id)}
            aria-current={esta ? "page" : undefined}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 h-12 px-3 rounded-xl border text-sm font-semibold transition-colors",
              esta
                ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
            )}
          >
            <Icon className="h-4 w-4" /> {s.label}
            {(pendientes[s.id] ?? 0) > 0 && <Contador n={pendientes[s.id] ?? 0} />}
          </button>
        );
      })}
    </nav>
  );
}

/** Escritorio: el menú agrupado por lo que vienes a hacer. */
export function MenuSeccionesEscritorio({ secciones, activa, pendientes, onIr }: MenuProps) {
  return (
    <nav aria-label="Secciones de configuración" className="hidden lg:block space-y-4 lg:sticky lg:top-4">
      {GRUPOS_AJUSTES.map((g) => {
        const items = secciones.filter((s) => s.grupo === g);
        if (items.length === 0) return null;
        return (
          <div key={g}>
            <span className="block px-3 mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{g}</span>
            <div className="space-y-0.5">
              {items.map((s) => {
                const Icon = s.icon;
                const esta = s.id === activa;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onIr(s.id)}
                    aria-current={esta ? "page" : undefined}
                    title={s.desc}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 h-12 rounded-xl text-left text-sm transition-colors",
                      esta
                        ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] font-bold"
                        : "text-[var(--text-secondary)] font-semibold hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{s.label}</span>
                    {(pendientes[s.id] ?? 0) > 0 && <Contador n={pendientes[s.id] ?? 0} className="ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * La cabecera de la sección, en una fila: ícono, título, ⓘ con lo que hay
 * adentro y, si falta algo, «Te falta (N)» con un menú que salta a cada campo.
 */
export function CabeceraSeccion({ meta, tituloId, faltan, onIrACampo }: {
  meta: SeccionMeta;
  tituloId: string;
  faltan: readonly FaltaItem[];
  onIrACampo: (f: FaltaItem) => void;
}) {
  const Icon = meta.icon;
  const acciones: MenuAccion[] = faltan.map((f) => ({
    id: f.id,
    label: f.label,
    icon: CircleDot,
    onSelect: () => onIrACampo(f),
  }));
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <Icon className="h-5 w-5" />
      </span>
      <SectionTitle id={tituloId} className="min-w-0">{meta.label}</SectionTitle>
      <InfoTip title={meta.label} what={meta.desc} />
      {acciones.length > 0 && (
        <div className="ml-auto">
          <ActionMenu
            label="Te falta"
            icon={AlertTriangle}
            variant="accent"
            badge={acciones.length}
            title={`Te faltan: ${faltan.map((f) => f.label).join(", ")}`}
            actions={acciones}
            compactoEnMovil
          />
        </div>
      )}
    </div>
  );
}
