"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Target, TrendingUp, RefreshCw } from "@buleje/design-system/icons";
import { BlockTitle, ErrorAlert, LoadingState } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { SERIES } from "@/components/admin/shared/chart-palette";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";

/**
 * SalesChannelsAnalyticsPanel — las visitas de la tienda en Tienda online ›
 * Redes y medición. Desde el 10-10 es la ÚNICA vista de `/api/store-page/
 * analytics`: absorbió lo que solo tenía «Métricas y desempeño» (AnalyticsTab,
 * que se montaba en Apariencia › Avanzado): visitas de 7 días, las series y
 * los sitios y campañas de donde llegan. Las dos pedían lo mismo y repetían
 * tres cifras.
 *
 * Agrupa las fuentes UTM en TikTok / Meta / Google / Directo / Otros y muestra
 * visitas + conversiones + reparto por canal.
 *
 * IMPORTANTE: es tráfico+conversiones a nivel VISITA, no ingreso por pedido —
 * la atribución de S/ por canal requeriría capturar utm_source en el checkout
 * (zona de pagos). Se aclara en la UI para no prometer un dato que no existe.
 *
 * 11-10 (patrón del panel): las cuatro cifras van en los Indicadores plegables
 * de la cabecera de Redes y medición (`useIndicadoresVisitas`) y el detalle
 * —por canal, por día, sitios y campañas— en un bloque plegado
 * (`DetalleVisitas`). Antes las cuatro tarjetas con su minigráfico repetían la
 * barra «Visitas por día» y «Campañas» repetía el «Directo» de «Por canal»
 * (202 visitas tres veces en main).
 *
 * Las variaciones «vs semana previa» de AnalyticsTab NO se trajeron: comparaba
 * contra un tercio de los otros 23 días (no la semana previa) y la etiqueta
 * mentía. Sin la serie de 14 días del backend no hay delta honesto.
 */

export type Analytics = {
  visits7d?: number;
  visits30d?: number;
  conversions7d?: number;
  conversions30d?: number;
  conversionRate30d?: number;
  topReferrers?: { referrer?: string; source?: string; count: number }[];
  topUtmSources?: { source: string; count: number }[];
  visitsByDay?: { day: string; visits: number; conversions: number }[];
};

type ChannelDef = { key: string; color: string; match: (s: string) => boolean };

// Orden = prioridad de match (Otros es el fallback). Colores de la rampa
// única de gráficos (SERIES): antes Meta usaba `--data-info-500`, que en el
// panel es el mismo teal que «Otros» (`--accent`) — dos barras iguales.
const CHANNELS: ChannelDef[] = [
  { key: "TikTok", color: SERIES[3], match: (s) => s.includes("tiktok") || s === "tt" },
  { key: "Meta", color: SERIES[1], match: (s) => /facebook|instagram|meta|^fb$|^ig$/.test(s) },
  { key: "Google", color: SERIES[2], match: (s) => s.includes("google") || s.includes("gads") },
  { key: "Directo", color: SERIES[4], match: (s) => s === "(none)" || s === "direct" || s === "directo" || s === "" },
];

function channelOf(source: string): string {
  const s = source.toLowerCase().trim();
  return CHANNELS.find((c) => c.match(s))?.key ?? "Otros";
}

function colorOf(key: string): string {
  return CHANNELS.find((c) => c.key === key)?.color ?? SERIES[0];
}

const n = (v: number | undefined) => (v ?? 0).toLocaleString("es-PE");

/** Lo que no es campaña: entrar directo o sin `utm_source`. Ya sale como «Directo» en Por canal. */
const SIN_CAMPANA = new Set(["", "(none)", "none", "direct", "directo"]);

export function useVisitasTienda() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallo, setFallo] = useState(false);

  const cargar = useCallback((senal?: { activo: boolean }) => {
    setLoading(true);
    setFallo(false);
    fetch("/api/store-page/analytics", { headers: csrfHeaders({}) })
      .then((r) => (r.ok ? (r.json() as Promise<Analytics>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (senal?.activo !== false) setData(d);
      })
      .catch((err) => {
        console.error("[sales-channels] analytics load failed", err);
        if (senal?.activo !== false) setFallo(true);
      })
      .finally(() => {
        if (senal?.activo !== false) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const senal = { activo: true };
    cargar(senal);
    return () => {
      senal.activo = false;
    };
  }, [cargar]);

  return { data, loading, fallo, cargar };
}

export type VisitasTienda = ReturnType<typeof useVisitasTienda>;

/** Las cuatro cifras de las visitas, en los Indicadores plegables de la cabecera. */
export function useIndicadoresVisitas({ data, loading, fallo }: VisitasTienda) {
  const tarjetas = [
    { rotulo: "Visitas, 7 días", valor: n(data?.visits7d), icono: Eye },
    { rotulo: "Visitas, 30 días", valor: n(data?.visits30d), icono: Eye },
    { rotulo: "Conversiones, 30 días", valor: n(data?.conversions30d), icono: Target, ayuda: "Visitas que terminaron en un pedido." },
    { rotulo: "Conversión, 30 días", valor: `${(data?.conversionRate30d ?? 0).toFixed(1)} %`, icono: TrendingUp, ayuda: "Conversiones ÷ visitas de los últimos 30 días." },
  ];
  return useKpisPlegables({
    claveMemoria: "tienda-redes-visitas",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && !data,
    resumen: fallo && !data ? "Visitas sin cargar" : `${n(data?.visits30d)} visitas en 30 días`,
    tarjetas: tarjetas.map(({ rotulo, valor, icono: Icono, ayuda }) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={<span>{ayuda}</span>} />}
        </div>
        <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</p>
      </div>
    )),
  });
}

/** El resumen de una línea del bloque plegado: de dónde llega lo más. */
export function resumenDeVisitas({ data, loading, fallo }: VisitasTienda): string {
  if (loading && !data) return "Cargando…";
  if (fallo || !data) return "No se pudieron cargar";
  const [primero] = canales(data);
  const sitios = (data.topReferrers ?? []).length;
  if (!primero) return sitios ? `${sitios} sitios te enlazan` : "Sin visitas todavía";
  return `${primero.key} ${primero.pct} %${sitios ? ` · ${sitios} sitios te enlazan` : ""}`;
}

function canales(data: Analytics) {
  // Agrupa las fuentes UTM en canales y suma sus visitas.
  const byChannel = new Map<string, number>();
  let tracked = 0;
  for (const { source, count } of data.topUtmSources ?? []) {
    const k = channelOf(source);
    byChannel.set(k, (byChannel.get(k) ?? 0) + count);
    tracked += count;
  }
  return [...byChannel.entries()]
    .map(([key, visits]) => ({ key, visits, pct: tracked ? Math.round((visits / tracked) * 100) : 0 }))
    .sort((a, b) => b.visits - a.visits);
}

/** El detalle de las visitas: por canal, por día, sitios que enlazan y campañas. */
export function DetalleVisitas({ data, loading, fallo, cargar }: VisitasTienda) {
  if (loading && !data) return <LoadingState message={null} className="py-8" />;
  if (fallo || !data) {
    return (
      <ErrorAlert
        description="No se pudieron cargar las visitas."
        action={
          <button type="button" onClick={() => cargar()} className={button({ variant: "secondary", className: "rounded-xl" })}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        }
      />
    );
  }
  const dias = data.visitsByDay ?? [];
  const rows = canales(data);
  const maxDay = Math.max(1, ...dias.map((d) => d.visits));
  const campanas = (data.topUtmSources ?? []).filter((r) => !SIN_CAMPANA.has((r.source ?? "").toLowerCase().trim()));

  return (
    <div className="space-y-4">
      {/* R2: el reparto por red era de Canales (Pro). */}
      <PermisoDe origen="canales">
      <div className="space-y-2.5">
        <BlockTitle className="text-sm">Por canal</BlockTitle>
        {rows.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            Aún no hay visitas por canal
            <InfoTip
              title="Visitas por canal"
              what={<span>Comparte tu tienda con enlaces UTM y verás cuánto tráfico trae cada red.</span>}
              example={<span className="font-mono">?utm_source=tiktok</span>}
            />
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-[var(--text-primary)]">{r.key}</span>
                <span className="text-[var(--text-secondary)] tabular-nums">
                  {n(r.visits)} visitas · {r.pct} %
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: colorOf(r.key) }} />
              </div>
            </div>
          ))
        )}
      </div>
      </PermisoDe>

      {dias.length > 0 && (
        <div className="space-y-1.5">
          <BlockTitle className="text-sm">Visitas por día, últimos 30 días</BlockTitle>
          <div className="flex items-end gap-0.5 h-16">
            {dias.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.visits} visitas, ${d.conversions} conversiones`}
                className="flex-1 rounded-t bg-[var(--accent)] min-h-[2px]"
                style={{ height: `${Math.max(4, (d.visits / maxDay) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ListaDeFuentes
          titulo="Sitios que te enlazan"
          filas={(data.topReferrers ?? []).map((r) => ({ nombre: r.referrer ?? r.source ?? "—", count: r.count }))}
        />
        <ListaDeFuentes
          titulo="Campañas (utm_source)"
          vacio="Sin campañas: todo llegó directo."
          filas={campanas.map((r) => ({ nombre: r.source, count: r.count }))}
        />
      </div>
    </div>
  );
}

/** Top de fuentes de los últimos 30 días (lo que mostraba AnalyticsTab). */
function ListaDeFuentes({ titulo, filas, vacio = "Sin visitas todavía." }: { titulo: string; filas: { nombre: string; count: number }[]; vacio?: string }) {
  return (
    <div className="space-y-2">
      <BlockTitle className="text-sm">{titulo}</BlockTitle>
      {filas.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">{vacio}</p>
      ) : (
        <ul className="space-y-1.5">
          {filas.map((f) => (
            <li key={f.nombre} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-[var(--text-primary)]">{f.nombre}</span>
              <span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">{n(f.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
