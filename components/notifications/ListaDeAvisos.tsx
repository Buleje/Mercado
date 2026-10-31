"use client";

/**
 * La lista de avisos guardados del centro de notificaciones, con sus estados
 * (rediseño 18-10): no se pudo leer · cargando · todo al día · los avisos por
 * día. Cada día es un rótulo chico que queda pegado arriba al deslizar; dentro,
 * lo sin leer y urgente primero (`ordenarDelDia`) y los repetidos en una fila.
 */
import { CheckCheck, WifiOff } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import NotificationItem from "./NotificationItem";
import type { AvisoJunto } from "./avisos-juntos";
import type { GrupoDelDia } from "./notificaciones-categorias";
import type { NotificationItem as NotificationItemType } from "./useNotificationCenter";

export type GrupoDeJuntos = { grupo: GrupoDelDia; items: AvisoJunto<NotificationItemType>[] };

interface Props {
  grupos: readonly GrupoDeJuntos[];
  estado: "fallo" | "cargando" | "vacio" | "lista";
  /** Para la frase del estado vacío. */
  soloSinLeer: boolean;
  nombreCategoria: string | null;
  onReintentar: () => void;
  /** Vacío por un filtro: volver a verlo todo. */
  onQuitarFiltros?: () => void;
  onMarkRead: (id: string) => void | Promise<void>;
  onNavegar: () => void;
}

const BOTON_TEXTO =
  "inline-flex h-12 items-center rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:text-[var(--accent)]";

function Esqueleto() {
  return (
    <div className="space-y-1 pt-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 py-3 pl-5 pr-3">
          <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[var(--surface-sunken)]" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-3.5 w-2/3 animate-pulse rounded-full bg-[var(--surface-sunken)]" />
            <span className="block h-3 w-11/12 animate-pulse rounded-full bg-[var(--surface-sunken)]" />
          </span>
        </div>
      ))}
    </div>
  );
}

function TodoAlDia({ soloSinLeer, nombreCategoria, onQuitarFiltros }: Pick<Props, "soloSinLeer" | "nombreCategoria" | "onQuitarFiltros">) {
  const conFiltro = soloSinLeer || nombreCategoria !== null;
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span
        aria-hidden
        className="grid h-16 w-16 place-items-center rounded-full bg-[var(--data-success-500)]/10 ring-8 ring-[var(--data-success-500)]/5"
      >
        <CheckCheck className="h-7 w-7 text-[var(--data-success-ink)]" strokeWidth={2} />
      </span>
      <p className="mt-5 font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]">Todo al día</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
        {soloSinLeer ? "No te queda nada sin leer" : "No tienes avisos"}
        {nombreCategoria ? ` en ${nombreCategoria}.` : "."}
      </p>
      {conFiltro && onQuitarFiltros && (
        <button type="button" onClick={onQuitarFiltros} className={cn(BOTON_TEXTO, "mt-3")}>
          Ver todos los avisos
        </button>
      )}
    </div>
  );
}

export default function ListaDeAvisos({
  grupos,
  estado,
  soloSinLeer,
  nombreCategoria,
  onReintentar,
  onQuitarFiltros,
  onMarkRead,
  onNavegar,
}: Props) {
  if (estado === "fallo") {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-2xl bg-[var(--surface-sunken)] py-2 pl-4 pr-2">
        <WifiOff className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
        <p className="flex-1 text-sm text-[var(--text-primary)]">No se pudieron traer los avisos.</p>
        <button type="button" onClick={onReintentar} className={BOTON_TEXTO}>
          Reintentar
        </button>
      </div>
    );
  }
  if (estado === "cargando") return <Esqueleto />;
  if (estado === "vacio") {
    return <TodoAlDia soloSinLeer={soloSinLeer} nombreCategoria={nombreCategoria} onQuitarFiltros={onQuitarFiltros} />;
  }
  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <section key={g.grupo} aria-label={g.grupo}>
          {/* Pegado arriba al deslizar; el fondo tapa la fila que pasa por debajo. */}
          <CardTitle className="sticky top-0 z-[1] -mx-5 bg-[var(--surface-raised)] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] sm:-mx-6 sm:px-6">
            {g.grupo}
          </CardTitle>
          <div className="space-y-0.5">
            {g.items.map((j) => (
              <NotificationItem
                key={j.aviso.id}
                notification={j.aviso}
                junto={j}
                onMarkRead={onMarkRead}
                onNavegar={onNavegar}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
