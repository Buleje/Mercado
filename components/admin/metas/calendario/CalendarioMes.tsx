"use client";

/**
 * CalendarioMes — la sub-vista «Calendario» de Metas y logros (ex Semana/Mes, ADR-488).
 *
 * Antes la meta del mes eran S/ 50.000 en el localStorage y cada venta caía en
 * el día de `toISOString()` (las de después de las 19:00 de Lima, en el día
 * siguiente). Ahora los días son los de Lima que arma `/api/goals/serie`, las
 * metas (diaria, semanal y mensual de ventas) son las de la base, y se puede ir
 * al mes anterior o al siguiente.
 */
import { useState } from "react";
import { CardTitle, StatCard } from "@buleje/design-system";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShoppingCart,
  Star,
  TrendingUp,
} from "@buleje/design-system/icons";
import WeeklyGoalCard from "@/components/admin/WeeklyGoalCard";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { ModalMeta } from "@/components/admin/metas/ModalMeta";
import type { PresetMeta } from "@/components/admin/metas/PlantillasMeta";
import { AvisoDeCarga } from "@/components/admin/metas/AvisoDeCarga";
import { BadgeArea } from "@/components/admin/metas/TarjetaMeta";
import { useMetas } from "@/hooks/use-metas";
import { useSerieMes } from "@/hooks/use-metas-serie";
import { hrefDeMeta } from "@/lib/admin/metas-catalogo";
import { metaDeVentas } from "@/lib/metas/logros-reglas";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { cn, limaDateKey } from "@/lib/utils";
import { GrillaDelMes } from "./GrillaDelMes";
import { MetaDelMes } from "./MetaDelMes";
import { moverMes, nombreDelMes, resumirMes } from "./calendario-calculos";

const soles = (n: number) => cifraDeMeta(n, "S/");
const BOTON_ICONO =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
const VACIO = {};

export function CalendarioMes() {
  const { metas, recargar: recargarMetas } = useMetas();
  const [mes, setMes] = useState<string | null>(null);
  const serie = useSerieMes(mes);
  const [preset, setPreset] = useState<PresetMeta | null>(null);

  const hoy = serie.datos?.hoy ?? limaDateKey();
  const mesHoy = hoy.slice(0, 7);
  const pedido = mes ?? mesHoy;
  const delMes = serie.datos?.mes === pedido ? serie.datos : null;
  const listo = delMes !== null;
  /** Lo que muestran las cifras sin dato: «…» mientras carga; «—» si la carga falló. */
  const pendiente = serie.error ? "—" : "…";
  const dias = delMes?.dias ?? VACIO;
  const anterior = delMes?.anterior.dias ?? VACIO;

  const metaDiaria = metaDeVentas(metas, "diario")?.target ?? null;
  const metaSemanal = metaDeVentas(metas, "semanal")?.target ?? null;
  const metaMensual = metaDeVentas(metas, "mensual")?.target ?? null;
  const r = resumirMes(pedido, dias, anterior, hoy, metaDiaria);
  const href = hrefDeMeta("ventas");
  const ir = (n: number) => {
    const destino = moverMes(pedido, n);
    setMes(destino === mesHoy ? null : destino);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <button
          type="button"
          className={BOTON_ICONO}
          aria-label="Mes anterior"
          title="Mes anterior"
          onClick={() => ir(-1)}
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <CardTitle className="text-center sm:min-w-[9.5rem] text-sm font-bold capitalize">
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
          what="Cada día del mes (día de Lima) con lo que vendiste: ventas del POS más pedidos que entran."
          body={
            metaDiaria !== null
              ? `Verde = vendió al menos tu meta diaria (${soles(metaDiaria)}); rojo suave = no llegó.`
              : "Sin meta diaria, el color más fuerte es el día que más vendiste."
          }
          example="Una venta de las 20:00 del 8 cuenta en el 8, no en el 9."
        />
        {pedido !== mesHoy && (
          <button
            type="button"
            className="min-h-10 px-2 text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
            onClick={() => setMes(null)}
          >
            Volver a este mes
          </button>
        )}
        <span className="ml-auto flex items-center gap-1">
          {href && (
            <EnlacePanel
              href={href}
              apariencia="heredada"
              title="Son metas de Ventas: abre Ventas y caja"
              aria-label="Ver en Ventas"
              className="inline-flex min-h-10 items-center gap-1 px-1 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]"
            >
              <BadgeArea category="ventas" />
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
          <div className={cn("grid items-start gap-3", pedido === mesHoy && "lg:grid-cols-2")}>
            <MetaDelMes
              mes={pedido}
              hoy={hoy}
              total={r.total}
              meta={metaMensual}
              cargando={!listo}
              onPonerMeta={() => setPreset({ category: "ventas", period: "mensual" })}
            />
            {pedido === mesHoy && listo && (
              <WeeklyGoalCard
                hoy={hoy}
                dias={{ ...anterior, ...dias }}
                metaSemanal={metaSemanal}
                metaDiaria={metaDiaria}
                onPonerMeta={() => setPreset({ category: "ventas", period: "semanal" })}
              />
            )}
          </div>

          <section
            aria-label={`Días de ${nombreDelMes(pedido)}`}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4"
          >
            {listo ? (
              <GrillaDelMes
                mes={pedido}
                dias={dias}
                hoy={hoy}
                metaDiaria={metaDiaria}
                maximo={r.maximo}
              />
            ) : (
              <div className="grid grid-cols-7 gap-1" aria-busy={pendiente === "…"}>
                {Array.from({ length: 35 }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "min-h-11 rounded-lg bg-[var(--surface-sunken)] sm:min-h-14",
                      pendiente === "…" && "animate-pulse motion-reduce:animate-none",
                    )}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              density="compact"
              label="Total del mes"
              value={listo ? soles(r.total) : pendiente}
              icon={TrendingUp}
              delta={r.delta ?? undefined}
              deltaLabel={r.delta !== null ? "vs el mes anterior al mismo día" : undefined}
              subValue={
                listo && r.delta === null
                  ? `Mes anterior al mismo día: ${soles(r.anteriorAlDia)}`
                  : undefined
              }
            />
            <StatCard
              density="compact"
              label="Ticket promedio"
              value={!listo ? pendiente : r.n > 0 ? soles(r.total / r.n) : "Sin ventas"}
              icon={ShoppingCart}
              subValue={listo ? `${r.n} ${r.n === 1 ? "venta" : "ventas"}` : undefined}
            />
            <StatCard
              density="compact"
              label="Mejor día"
              value={
                !listo
                  ? pendiente
                  : r.mejorDia
                    ? `${r.mejorDia.fecha.slice(8, 10)}/${r.mejorDia.fecha.slice(5, 7)}`
                    : "—"
              }
              icon={Star}
              subValue={!listo ? undefined : r.mejorDia ? soles(r.mejorDia.total) : "Sin ventas"}
            />
            <StatCard
              density="compact"
              label={metaDiaria !== null ? "Días con meta" : "Días con venta"}
              value={listo ? `${r.cumplidos}/${r.transcurridos}` : pendiente}
              icon={Calendar}
              subValue={metaDiaria !== null ? `Meta diaria ${soles(metaDiaria)}` : "Sin meta diaria"}
            />
          </div>
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
