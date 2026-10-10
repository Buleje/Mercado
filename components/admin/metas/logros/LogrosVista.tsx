"use client";

/**
 * LogrosVista — la sub-vista «Logros» de Metas y logros (ADR-488): el
 * historial de lo que ganaste, lo próximo por ganar y los récords del negocio.
 *
 * Los logros se miden en el servidor (`GET /api/goals/logros`) con los datos
 * del negocio, en el día de Lima. Una sola grilla: primero lo ganado (lo más
 * reciente arriba, con su día), después lo que tienes más cerca, con cuánto te
 * falta. Las 6 áreas son chips de filtro en la fila de arriba (antes cada una
 * ocupaba su fila de título); «Indicadores» trae los récords (mejor día,
 * semana, mes y racha más larga), que ninguna otra vista dice.
 *
 * Auditoría 10-10: «Meta cumplida» se fue (repetía el «Cumplidas x de y» de
 * Metas) y «Mejor día» ya no dice lo vendido hoy (eso es de Hoy).
 */
import { useState, type CSSProperties } from "react";
import { CardTitle } from "@buleje/design-system";
import { RefreshCw, Trophy } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { AvisoDeCarga } from "@/components/admin/metas/AvisoDeCarga";
import { claseChip } from "@/components/admin/metas/clases-meta";
import { useLogros } from "@/hooks/use-metas-serie";
import { hrefDeMeta } from "@/lib/admin/metas-catalogo";
import type { AreaLogro, LogroDTO } from "@/lib/metas/logros-reglas";
import { formatTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { AREAS_LOGRO } from "./areas-logro";
import { avanceLogro } from "./formato-logro";
import { useRecordsDelNegocio } from "./RecordsDelNegocio";
import { TarjetaLogro } from "./TarjetaLogro";

const BOTON_ICONO =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
const COLOR_AREA: ReadonlyMap<AreaLogro, string> = new Map(AREAS_LOGRO.map((a) => [a.id, a.color]));

/** Ganados primero (el más reciente arriba); después los que más avanzaron; «sin dato» al final. */
function ordenar(a: LogroDTO, b: LogroDTO): number {
  if (a.ganado !== b.ganado) return a.ganado ? -1 : 1;
  if (a.ganado) return (b.desde ?? "").localeCompare(a.desde ?? "");
  if (!!a.sinDato !== !!b.sinDato) return a.sinDato ? 1 : -1;
  return avanceLogro(b) - avanceLogro(a);
}

type Filtro = AreaLogro | "todas";

export function LogrosVista() {
  const { datos, cargando, error, sinPermiso, recargar, actualizado } = useLogros();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const logros = datos?.logros ?? [];
  const hoy = datos?.hoy ?? limaDateKey();
  const areas = AREAS_LOGRO.map((def) => ({ def, suyos: logros.filter((l) => l.area === def.id) })).filter(
    (a) => a.suyos.length > 0,
  );
  const elegida = filtro === "todas" ? null : (areas.find((a) => a.def.id === filtro) ?? null);
  const visibles = [...(elegida ? elegida.suyos : logros)].sort(ordenar);
  const proximo = visibles.find((l) => !l.ganado && !l.sinDato && avanceLogro(l) > 0)?.id ?? null;
  const ganados = logros.filter((l) => l.ganado).length;
  const href = elegida?.def.categoria ? hrefDeMeta(elegida.def.categoria) : null;
  const records = useRecordsDelNegocio({ records: datos?.records ?? null, hoy, listo: datos !== null });

  return (
    <div data-logros-vista className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Trophy aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
        <CardTitle className="text-sm font-bold tabular-nums">
          {datos ? `${ganados} de ${logros.length} ganados` : "Logros"}
        </CardTitle>
        <InfoTip
          title="Logros"
          what="Se ganan solos con tus datos reales: ventas, clientes, caja, constancia, marketplace y aserradero. Se miden cada vez que entras (día de Lima). Arriba lo que ganaste, con su día; después lo que tienes más cerca."
          body="La racha cuenta días seguidos con al menos una venta; hoy no la corta mientras el día siga abierto. «Indicadores» trae tus récords: mejor día, semana (lunes a domingo) y mes, y la racha más larga, en los últimos 400 días."
          example="«Racha 7 · te faltan 3 días»: vendiste 4 días seguidos. Toca un área para ver sólo sus logros; tócala otra vez para ver todos."
        />
        {href && elegida && (
          <EnlacePanel
            href={href}
            title={`Abre ${elegida.def.nombre}`}
            className="hidden min-h-12 items-center px-2 text-sm font-semibold sm:inline-flex"
          >
            Ver en {elegida.def.corto} ›
          </EnlacePanel>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {!sinPermiso && records.boton}
          <button
            type="button"
            className={BOTON_ICONO}
            aria-label="Volver a medir"
            title={actualizado ? `Volver a medir (medido a las ${formatTime(actualizado)})` : "Volver a medir"}
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

      {datos && areas.length > 1 && (
        <div
          role="group"
          aria-label="Logros por área"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
        >
          <button
            type="button"
            aria-pressed={filtro === "todas"}
            className={cn(claseChip(filtro === "todas"), "h-12 px-3")}
            onClick={() => setFiltro("todas")}
          >
            Todos
          </button>
          {areas.map(({ def, suyos }) => {
            const Icono = def.icono;
            const suyosGanados = suyos.filter((l) => l.ganado).length;
            return (
              <button
                key={def.id}
                type="button"
                aria-pressed={filtro === def.id}
                aria-label={`${def.nombre}: ${suyosGanados} de ${suyos.length} ganados`}
                title={def.nombre}
                className={cn(claseChip(filtro === def.id), "h-12 px-3")}
                style={{ "--area": def.color } as CSSProperties}
                onClick={() => setFiltro(filtro === def.id ? "todas" : def.id)}
              >
                <Icono aria-hidden="true" className="h-4 w-4 text-[var(--area)]" />
                {def.corto}
                <span className="tabular-nums">
                  {suyosGanados}/{suyos.length}
                </span>
              </button>
            );
          })}
          {href && elegida && (
            <EnlacePanel
              href={href}
              title={`Abre ${elegida.def.nombre}`}
              className="inline-flex min-h-12 shrink-0 items-center px-2 text-sm font-semibold sm:hidden"
            >
              Ver en {elegida.def.corto} ›
            </EnlacePanel>
          )}
        </div>
      )}

      <AvisoDeCarga error={error} sinPermiso={sinPermiso} onReintentar={() => recargar()} que="los logros" />

      {!sinPermiso && records.panel}

      {!datos && cargando && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="h-16 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
          ))}
        </div>
      )}

      {datos && logros.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          Todavía no hay logros que medir: aparecen con tu primera venta.
        </p>
      )}

      {visibles.length > 0 && (
        <ul aria-label={elegida ? `Logros de ${elegida.def.nombre}` : "Todos los logros"} className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((l) => (
            <TarjetaLogro
              key={l.id}
              logro={l}
              color={COLOR_AREA.get(l.area) ?? "var(--accent)"}
              hoy={hoy}
              proximo={l.id === proximo}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
