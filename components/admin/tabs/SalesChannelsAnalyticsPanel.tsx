"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Eye, Target, TrendingUp, RefreshCw } from "@buleje/design-system/icons";
import { BlockTitle, CardTitle, ErrorAlert, LoadingState, StatCard } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { SERIES } from "@/components/admin/shared/chart-palette";
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
 * Las variaciones «vs semana previa» de AnalyticsTab NO se trajeron: comparaba
 * contra un tercio de los otros 23 días (no la semana previa) y la etiqueta
 * mentía. Sin la serie de 14 días del backend no hay delta honesto.
 */

type Analytics = {
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

export default function SalesChannelsAnalyticsPanel() {
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

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5 space-y-4">
      <header className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[var(--accent)]" aria-hidden />
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Visitas de tu tienda</CardTitle>
        <InfoTip
          title="Visitas de tu tienda"
          what={<span>Visitas y conversiones de tu tienda en los últimos 30 días, de qué red llegaron y qué sitios te enlazan.</span>}
          example={<span>Para ver soles (S/) por canal hay que capturar el <span className="font-mono">utm_source</span> en el checkout.</span>}
        />
      </header>

      {loading ? (
        <LoadingState message={null} className="py-8" />
      ) : fallo || !data ? (
        <ErrorAlert
          description="No se pudieron cargar las visitas."
          action={
            <button type="button" onClick={() => cargar()} className={button({ variant: "secondary", className: "rounded-xl" })}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
            </button>
          }
        />
      ) : (
        <Medicion data={data} />
      )}
    </section>
  );
}

function Medicion({ data }: { data: Analytics }) {
  const dias = data.visitsByDay ?? [];

  // Agrupa las fuentes UTM en canales y suma sus visitas.
  const byChannel = new Map<string, number>();
  let tracked = 0;
  for (const { source, count } of data.topUtmSources ?? []) {
    const k = channelOf(source);
    byChannel.set(k, (byChannel.get(k) ?? 0) + count);
    tracked += count;
  }
  const rows = [...byChannel.entries()]
    .map(([key, visits]) => ({ key, visits, pct: tracked ? Math.round((visits / tracked) * 100) : 0 }))
    .sort((a, b) => b.visits - a.visits);
  const maxDay = Math.max(1, ...dias.map((d) => d.visits));

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Rótulo corto + período en subValue: «Conversiones, 30 días» partía en
            dos renglones a 1280 y a 400 (captura 10-10). */}
        <StatCard density="compact" icon={Eye} label="Visitas" subValue="últimos 7 días" value={n(data.visits7d)} sparkline={{ data: dias.slice(-7).map((d) => d.visits) }} />
        <StatCard density="compact" icon={Eye} label="Visitas" subValue="últimos 30 días" value={n(data.visits30d)} sparkline={{ data: dias.map((d) => d.visits) }} />
        <StatCard density="compact" icon={Target} label="Conversiones" subValue="últimos 30 días" value={n(data.conversions30d)} sparkline={{ data: dias.map((d) => d.conversions) }} />
        <StatCard density="compact" icon={TrendingUp} label="Conversión" subValue="últimos 30 días" value={`${(data.conversionRate30d ?? 0).toFixed(1)} %`} />
      </div>

      {/* R2: el reparto por red era de Canales (Pro); las cifras y las listas
          de abajo las veía también Mi Tienda (Básico) en Avanzado. */}
      <PermisoDe origen="canales">
      <div className="space-y-2.5">
        <BlockTitle className="text-sm">Por canal</BlockTitle>
        {rows.length === 0 ? (
          <p className="flex items-center justify-center gap-1.5 text-sm text-[var(--text-secondary)] rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-4 text-center">
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
          filas={(data.topUtmSources ?? []).map((r) => ({ nombre: r.source || "(sin nombre)", count: r.count }))}
        />
      </div>
    </>
  );
}

/** Top de fuentes de los últimos 30 días (lo que mostraba AnalyticsTab). */
function ListaDeFuentes({ titulo, filas }: { titulo: string; filas: { nombre: string; count: number }[] }) {
  return (
    <div className="space-y-2">
      <BlockTitle className="text-sm">{titulo}</BlockTitle>
      {filas.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Sin visitas todavía.</p>
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
