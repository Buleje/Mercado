"use client";

/**
 * CalendarioMes — la sub-vista «Calendario» de Metas y logros (ex Semana/Mes, ADR-488).
 *
 * Los días son los de Lima que arma `/api/goals/serie`, las metas (diaria,
 * semanal y mensual de ventas) son las de la base, y se puede ir al mes
 * anterior o al siguiente.
 *
 * Tarea propia (auditoría de duplicados 10-10): «el mes día por día contra la
 * meta». Brandon: «compactar para que la información central esté bien vista».
 *  · Una sola fila de cabecera: mes ‹ ›, ⓘ, «Este mes», «Indicadores» (con la
 *    meta del mes en el titular), Ventas › y actualizar.
 *  · La grilla es lo central (`GrillaDelMes`): trae el total de cada semana,
 *    la fila ✓ por día de la semana y el detalle del día tocado.
 *  · Se fueron la tarjeta «Esta semana» (repetía la fila de la grilla) y el
 *    ticket promedio (está en Inicio › Ventas); el mejor día es la estrella de
 *    la grilla. La meta del mes y las cifras nuevas van plegadas
 *    (`useIndicadoresDelMes`).
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, RefreshCw, ShoppingCart, Target } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { ModalMeta } from "@/components/admin/metas/ModalMeta";
import type { PresetMeta } from "@/components/admin/metas/PlantillasMeta";
import { AvisoDeCarga } from "@/components/admin/metas/AvisoDeCarga";
import { BOTON_SECUNDARIO } from "@/components/admin/metas/clases-meta";
import { useMetas } from "@/hooks/use-metas";
import { useSerieMes } from "@/hooks/use-metas-serie";
import { hrefDeMeta } from "@/lib/admin/metas-catalogo";
import { metaDeVentas, type VentasPorDia } from "@/lib/metas/logros-reglas";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { cn, limaDateKey } from "@/lib/utils";
import { GrillaDelMes } from "./GrillaDelMes";
import { useIndicadoresDelMes } from "./IndicadoresDelMes";
import { cumplimientoPorDiaSemana, diasDelMes, moverMes, nombreDelMes, resumirMes } from "./calendario-calculos";

const soles = (n: number) => cifraDeMeta(n, "S/");
const BOTON_ICONO =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
const VACIO: VentasPorDia = {};

export function CalendarioMes() {
  const { metas, cargando: cargandoMetas, recargar: recargarMetas } = useMetas();
  const [mes, setMes] = useState<string | null>(null);
  const serie = useSerieMes(mes);
  const [preset, setPreset] = useState<PresetMeta | null>(null);

  const hoy = serie.datos?.hoy ?? limaDateKey();
  const mesHoy = hoy.slice(0, 7);
  const pedido = mes ?? mesHoy;
  const delMes = serie.datos?.mes === pedido ? serie.datos : null;
  const listo = delMes !== null;
  /** La grilla sin dato: pulsa mientras carga; quieta si la carga falló. */
  const pendiente = !serie.error;
  const dias = delMes?.dias ?? VACIO;
  const anterior = delMes?.anterior.dias ?? VACIO;
  const mesAnterior = delMes?.anterior.mes ?? moverMes(pedido, -1);

  const metaDiaria = metaDeVentas(metas, "diario")?.target ?? null;
  const metaSemanal = metaDeVentas(metas, "semanal")?.target ?? null;
  const metaMensual = metaDeVentas(metas, "mensual")?.target ?? null;
  const r = useMemo(() => resumirMes(pedido, dias, anterior, hoy), [pedido, dias, anterior, hoy]);
  const leidos = useMemo(() => ({ ...anterior, ...dias }), [anterior, dias]);
  const meses = useMemo(() => [pedido, mesAnterior], [pedido, mesAnterior]);
  const { cumpleMes, cumpleDosMeses } = useMemo(() => {
    const fechas = diasDelMes(pedido).dias;
    return {
      cumpleMes: cumplimientoPorDiaSemana(fechas, dias, hoy, metaDiaria),
      cumpleDosMeses: cumplimientoPorDiaSemana(
        [...diasDelMes(mesAnterior).dias, ...fechas],
        leidos,
        hoy,
        metaDiaria,
      ),
    };
  }, [pedido, mesAnterior, dias, leidos, hoy, metaDiaria]);

  const indicadores = useIndicadoresDelMes({
    mes: pedido,
    hoy,
    r,
    metaMensual,
    metaDiaria,
    cumpleMes,
    cumpleDosMeses,
    mesAnterior,
    listo,
    onPonerMeta: () => setPreset({ category: "ventas", period: "mensual" }),
  });

  const href = hrefDeMeta("ventas");
  const ir = (n: number) => {
    const destino = moverMes(pedido, n);
    setMes(destino === mesHoy ? null : destino);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        <button type="button" className={BOTON_ICONO} aria-label="Mes anterior" title="Mes anterior" onClick={() => ir(-1)}>
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <CardTitle className="text-center text-sm font-bold capitalize sm:min-w-[8.5rem]">
          {nombreDelMes(pedido)}
        </CardTitle>
        <button
          type="button"
          className={BOTON_ICONO}
          aria-label="Mes siguiente"
          title="Mes siguiente"
          disabled={pedido >= mesHoy}
          onClick={() => ir(1)}
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
        <InfoTip
          title="Calendario"
          what="Cada día del mes (día de Lima) con lo que vendiste: ventas del POS más pedidos que entran. Toca un día y abajo sale su venta y la de su semana."
          body={
            metaDiaria !== null
              ? `Verde = vendió al menos tu meta diaria (${soles(metaDiaria)}); rojo suave = no llegó; la estrella, el mejor día del mes. La fila ✓ dice cuántos lunes, martes… cumplieron y la columna «Semana» suma de lunes a domingo contra tu meta semanal.`
              : "Sin meta diaria, el color más fuerte es el día que más vendiste; la estrella, el mejor día del mes. La columna «Semana» suma de lunes a domingo."
          }
          example="Una venta de las 20:00 del 8 cuenta en el 8, no en el 9. El ticket promedio está en Inicio › Ventas."
        />
        {pedido !== mesHoy && (
          <button
            type="button"
            className="min-h-12 px-2 text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
            onClick={() => setMes(null)}
          >
            Este mes
          </button>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-1">
          {!serie.sinPermiso && indicadores.boton}
          {!cargandoMetas && metaDiaria === null && (
            <button
              type="button"
              className={cn(BOTON_SECUNDARIO, "h-12 px-3 max-sm:w-12 max-sm:px-0")}
              aria-label="Ponle una meta diaria de ventas"
              title="Ponle una meta diaria de ventas: pinta de verde los días que llegan"
              onClick={() => setPreset({ category: "ventas", period: "diario" })}
            >
              <Target aria-hidden="true" className="h-4 w-4" />
              <span className="max-sm:sr-only">Meta diaria</span>
            </button>
          )}
          {href && (
            <EnlacePanel
              href={href}
              apariencia="heredada"
              title="Son metas de Ventas: abre Ventas y caja"
              aria-label="Ver en Ventas"
              className="hidden min-h-12 items-center gap-1 px-2 text-sm font-semibold text-[var(--accent-ink)] sm:inline-flex dark:text-[var(--accent)]"
            >
              <ShoppingCart aria-hidden="true" className="h-4 w-4" />
              Ventas
              <span aria-hidden="true">›</span>
            </EnlacePanel>
          )}
          <button
            type="button"
            className={BOTON_ICONO}
            aria-label="Actualizar"
            title="Actualizar"
            disabled={serie.cargando || serie.sinPermiso}
            onClick={() => serie.recargar()}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("h-4 w-4", serie.cargando && "animate-spin motion-reduce:animate-none")}
            />
          </button>
        </span>
      </div>

      <AvisoDeCarga
        error={serie.error}
        sinPermiso={serie.sinPermiso}
        onReintentar={() => serie.recargar()}
        que="lo vendido del mes"
      />

      {/* Sin permiso no se dibujan cifras en 0: serían falsas, no ocultas. */}
      {!serie.sinPermiso && (
        <>
          {indicadores.panel}
          <section
            aria-label={`Días de ${nombreDelMes(pedido)}`}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 sm:p-4"
          >
            {listo ? (
              <GrillaDelMes
                key={pedido}
                mes={pedido}
                dias={dias}
                leidos={leidos}
                meses={meses}
                hoy={hoy}
                metaDiaria={metaDiaria}
                metaSemanal={metaSemanal}
                metaMensual={metaMensual}
                mesTotal={r.total}
                maximo={r.maximo}
                mejorDia={r.mejorDia?.fecha ?? null}
                cumpleMes={cumpleMes}
              />
            ) : (
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5" aria-busy={pendiente}>
                {Array.from({ length: 35 }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-12 rounded-lg bg-[var(--surface-sunken)] sm:h-18",
                      pendiente && "animate-pulse motion-reduce:animate-none",
                    )}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {preset && (
        <ModalMeta
          abierto
          onCerrar={() => setPreset(null)}
          preset={preset}
          onGuardada={() => {
            setPreset(null);
            void recargarMetas();
          }}
        />
      )}
    </div>
  );
}
