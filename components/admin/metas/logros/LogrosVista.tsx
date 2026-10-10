"use client";

/**
 * LogrosVista — la sub-vista «Logros» de Metas y logros (ADR-488).
 *
 * Los logros se miden en el servidor (`GET /api/goals/logros`) con los datos
 * del negocio, en el día de Lima, y se agrupan por área: primero los ganados,
 * después los que faltan con su barra. Antes se calculaban en el navegador y
 * se guardaban en el localStorage (la racha nunca se escribía).
 */
import type { CSSProperties } from "react";
import { CardTitle } from "@buleje/design-system";
import { RefreshCw, Trophy } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { AvisoDeCarga } from "@/components/admin/metas/AvisoDeCarga";
import { useLogros } from "@/hooks/use-metas-serie";
import { hrefDeMeta } from "@/lib/admin/metas-catalogo";
import type { LogroDTO } from "@/lib/metas/logros-reglas";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AREAS_LOGRO } from "./areas-logro";
import { TarjetaLogro } from "./TarjetaLogro";

const BOTON_ICONO =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

/** Ganados primero (el más reciente arriba); después los que más avanzaron. */
function ordenar(a: LogroDTO, b: LogroDTO): number {
  if (a.ganado !== b.ganado) return a.ganado ? -1 : 1;
  if (a.ganado) return (b.desde ?? "").localeCompare(a.desde ?? "");
  const pa = a.progreso && a.progreso.meta > 0 ? a.progreso.valor / a.progreso.meta : 0;
  const pb = b.progreso && b.progreso.meta > 0 ? b.progreso.valor / b.progreso.meta : 0;
  return pb - pa;
}

export function LogrosVista() {
  const { datos, cargando, error, sinPermiso, recargar, actualizado } = useLogros();
  const logros = datos?.logros ?? [];
  const ganados = logros.filter((l) => l.ganado).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Trophy
          aria-hidden="true"
          className="h-5 w-5 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        />
        <CardTitle className="text-sm font-bold">Logros</CardTitle>
        <InfoTip
          title="Logros"
          what="Se ganan solos con tus datos reales: ventas, clientes, caja, constancia, marketplace y aserradero. Se miden cada vez que entras (día de Lima)."
          body="La racha cuenta días seguidos con ventas al menos de tu meta diaria; sin meta diaria, con al menos una venta."
          example="«Racha 7»: 7 días seguidos vendiendo tu meta diaria. Hoy no corta la racha mientras el día siga abierto."
        />
        {datos && (
          <span className="text-sm tabular-nums text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">{ganados}</b> de {logros.length} ganados
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {actualizado && (
            <span className="hidden text-xs text-[var(--text-tertiary)] sm:inline">
              Medido {formatTime(actualizado)}
            </span>
          )}
          <button
            type="button"
            className={BOTON_ICONO}
            aria-label="Volver a medir"
            title="Volver a medir"
            disabled={cargando || sinPermiso}
            onClick={() => recargar(true)}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("h-4 w-4", cargando && "animate-spin motion-reduce:animate-none")}
            />
          </button>
        </span>
      </div>

      <AvisoDeCarga
        error={error}
        sinPermiso={sinPermiso}
        onReintentar={() => recargar()}
        que="los logros"
      />

      {!datos && cargando && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="h-16 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
          ))}
        </div>
      )}

      {AREAS_LOGRO.map((area) => {
        const delArea = logros.filter((l) => l.area === area.id).sort(ordenar);
        if (delArea.length === 0) return null;
        const Icono = area.icono;
        const id = `logros-area-${area.id}`;
        const suyos = delArea.filter((l) => l.ganado).length;
        const href = area.categoria ? hrefDeMeta(area.categoria) : null;
        return (
          <section key={area.id} aria-labelledby={id} data-area={area.id} className="space-y-2">
            <div
              className="flex items-center gap-2"
              style={{ "--area": area.color } as CSSProperties}
            >
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--area)_14%,transparent)] text-[var(--area)]"
              >
                <Icono className="h-4 w-4" />
              </span>
              <CardTitle id={id} className="text-sm font-bold">
                {area.nombre}
              </CardTitle>
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {suyos} de {delArea.length}
              </span>
              {href && (
                <EnlacePanel
                  href={href}
                  title={`Abre ${area.nombre}`}
                  className="ml-auto inline-flex min-h-10 items-center text-sm"
                >
                  Ver en {area.nombre} ›
                </EnlacePanel>
              )}
            </div>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {delArea.map((l) => (
                <TarjetaLogro key={l.id} logro={l} color={area.color} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
