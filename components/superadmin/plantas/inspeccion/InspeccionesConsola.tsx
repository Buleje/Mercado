"use client";

/**
 * /superadmin/plantas/inspecciones — las inspecciones de todas las plantas, la
 * más nueva primero, con filtro por estado y por planta. Una inspección nueva
 * se abre desde la ficha de su planta (Seguimiento).
 */
import Link from "next/link";
import { EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { ClipboardCheck } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { button } from "@/components/ui-system/button-variants";
import type { EstadoInspeccion } from "@/lib/superadmin/plantas-forestales/tipos";
import { CONTROL, ESTADO_INSPECCION } from "../formato";
import { TablaInspecciones } from "./TablaInspecciones";
import { useInspecciones } from "./use-inspecciones";

export function InspeccionesConsola() {
  const s = useInspecciones();
  const { filtros } = s;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="insp-estado">Estado</label>
        <select
          id="insp-estado"
          className={CONTROL}
          value={filtros.estado}
          onChange={(e) => s.cambiar({ estado: e.target.value as EstadoInspeccion | "" })}
        >
          <option value="">Todo estado</option>
          {(Object.keys(ESTADO_INSPECCION) as EstadoInspeccion[]).map((e) => (
            <option key={e} value={e}>{ESTADO_INSPECCION[e].rotulo}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="insp-planta">Planta</label>
        <select id="insp-planta" className={`${CONTROL} max-w-full`} value={filtros.tenantId} onChange={(e) => s.cambiar({ tenantId: e.target.value })}>
          <option value="">Todas las plantas</option>
          {s.plantas.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <label className="inline-flex h-12 cursor-pointer items-center gap-2 px-1 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={filtros.incluirPrueba}
            onChange={(e) => s.cambiar({ incluirPrueba: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Incluir plantas de prueba
        </label>
        {s.hayFiltros && <Button variant="ghost" onClick={s.limpiar}>Limpiar</Button>}
        {s.data && (
          <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">
            {s.filas.length} de {s.total} · {s.abiertas} {s.abiertas === 1 ? "abierta" : "abiertas"}
          </span>
        )}
      </div>

      {s.error && (
        <ErrorAlert title="No se pudieron leer las inspecciones" description={s.error} action={<Button variant="secondary" onClick={s.recargar}>Reintentar</Button>} />
      )}
      {!s.data && s.cargando && <LoadingState message="Trayendo las inspecciones…" />}
      {s.data && (
        <div className={s.cargando ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={s.cargando}>
          {s.filas.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={s.hayFiltros ? "Ninguna con estos filtros" : "Todavía no hay inspecciones"}
              description={s.hayFiltros ? "Prueba con otro estado u otra planta." : "Se abren desde la ficha de cada planta, en Seguimiento."}
              action={
                s.hayFiltros
                  ? undefined
                  : { label: "Ver las plantas", node: <Link href="/superadmin/plantas" className={button({ variant: "secondary" })}>Ver las plantas</Link> }
              }
            />
          ) : (
            <TablaInspecciones filas={s.filas} conPlanta />
          )}
        </div>
      )}
    </div>
  );
}
