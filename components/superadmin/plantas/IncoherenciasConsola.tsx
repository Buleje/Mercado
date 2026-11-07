"use client";

import { EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { CheckCircle2 } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import type { GravedadIncoherencia, OrigenIncoherencia } from "@/lib/superadmin/plantas-forestales/tipos";
import { CONTROL, GRAVEDAD, m3, ORIGEN } from "./formato";
import { TablaIncoherencias } from "./TablaIncoherencias";
import { useIncoherencias } from "./use-incoherencias";

/** /superadmin/plantas/incoherencias — las de todas las plantas, la de más m³ en juego primero. */
export function IncoherenciasConsola() {
  const s = useIncoherencias();
  const { filtros } = s;
  const enJuego = s.items.reduce((t, it) => t + (it.m3EnJuego ?? 0), 0);
  const errores = s.items.filter((it) => it.gravedad === "error").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="inc-gravedad">Gravedad</label>
        <select id="inc-gravedad" className={CONTROL} value={filtros.gravedad} onChange={(e) => s.cambiar({ gravedad: e.target.value as GravedadIncoherencia | "" })}>
          <option value="">Toda gravedad</option>
          {(Object.keys(GRAVEDAD) as GravedadIncoherencia[]).map((g) => (
            <option key={g} value={g}>{GRAVEDAD[g].rotulo}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="inc-origen">Dónde</label>
        <select id="inc-origen" className={CONTROL} value={filtros.origen} onChange={(e) => s.cambiar({ origen: e.target.value as OrigenIncoherencia | "" })}>
          <option value="">Todo el libro</option>
          {(Object.keys(ORIGEN) as OrigenIncoherencia[]).map((o) => (
            <option key={o} value={o}>{ORIGEN[o]}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="inc-planta">Planta</label>
        <select id="inc-planta" className={`${CONTROL} max-w-full`} value={filtros.tenantId} onChange={(e) => s.cambiar({ tenantId: e.target.value })}>
          <option value="">Todas las plantas</option>
          {s.plantas.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <label className="inline-flex h-12 cursor-pointer items-center gap-2 px-1 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={filtros.incluirPrueba} onChange={(e) => s.cambiar({ incluirPrueba: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          Incluir plantas de prueba
        </label>
        {s.hayFiltros && <Button variant="ghost" onClick={s.limpiar}>Limpiar</Button>}
        {s.data && (
          <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">
            {s.items.length} {s.items.length === 1 ? "incoherencia" : "incoherencias"} · {errores} {errores === 1 ? "error" : "errores"} · {m3(enJuego)} en juego
          </span>
        )}
      </div>

      {s.error && (
        <ErrorAlert title="No se pudieron leer las incoherencias" description={s.error} action={<Button variant="secondary" onClick={s.recargar}>Reintentar</Button>} />
      )}
      {!s.data && s.cargando && <LoadingState message="Revisando el libro de cada planta…" />}
      {s.data && (
        <div className={s.cargando ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={s.cargando}>
          {s.items.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Sin incoherencias" description={s.hayFiltros ? "Ninguna con estos filtros." : "Ninguna planta muestra diferencias en su libro."} />
          ) : (
            <TablaIncoherencias items={s.items} slugDe={s.slugDe} conPlanta />
          )}
        </div>
      )}
    </div>
  );
}
