"use client";

/**
 * ResumenMeta — la meta de mix del aserradero y cómo viene la serie.
 *
 * El resumen dice qué salió; la meta dice qué se buscaba. Y la tendencia
 * responde lo que ninguna tabla contesta: ¿el mix está mejorando o me estoy
 * acostumbrando a cortar corto? La meta se guarda por tenant, así el número no
 * hay que recordarlo cada vez.
 */
import { useEffect, useMemo, useState } from "react";
import { Target, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import type { PrecioPt } from "@/lib/forestal/cubicacion-resumen";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import {
  evaluarMeta, serieTendencia, META_DEFAULT, TIPOS_META, type MetaMix,
} from "@/lib/forestal/cubicacion-meta";

const claveMeta = () => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-cubicacion-${slug}-meta`;
};

const n1 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 1 });
const fecha = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }); }
  catch { return iso.slice(5); }
};

export default function ResumenMeta({ rows, precioDe, guardadas }: {
  rows: PiezaCubicada[];
  precioDe: PrecioPt;
  /** Cubicaciones guardadas del tenant (para la serie histórica). */
  guardadas: CubicacionRegistro[];
}) {
  const [meta, setMeta] = useState<MetaMix>(META_DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveMeta());
      if (raw) setMeta({ ...META_DEFAULT, ...(JSON.parse(raw) as Partial<MetaMix>) });
    } catch { /* json corrupto → default */ }
  }, []);

  const guardar = (patch: Partial<MetaMix>) => {
    setMeta((m) => {
      const next = { ...m, ...patch };
      try { localStorage.setItem(claveMeta(), JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };

  const estado = useMemo(() => evaluarMeta(rows, meta, precioDe), [rows, meta, precioDe]);
  const tendencia = useMemo(() => serieTendencia(guardadas, meta), [guardadas, meta]);
  if (!estado) return null;

  const pico = Math.max(100, ...tendencia.puntos.map((p) => p.pctMeta));

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Target className="h-4 w-4 text-[var(--accent)]" /> Meta de mix
        </span>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          quiero al menos
          <input
            type="number" min={0} max={100} step={5} value={meta.pctMinimo}
            onChange={(e) => guardar({ pctMinimo: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            aria-label="Porcentaje mínimo de la meta"
            className="h-9 w-16 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-center text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          % de
          <select
            value={meta.tipo}
            onChange={(e) => guardar({ tipo: e.target.value as TipoComercial })}
            aria-label="Tipo de la meta"
            className="h-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            {TIPOS_META.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {/* Cómo viene ESTE lote contra la meta */}
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className={`font-bold ${estado.cumple
          ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>
          {estado.cumple
            ? `Cumple: ${n1(estado.actual)}% de ${meta.tipo}`
            : `Falta: ${n1(estado.actual)}% de ${meta.tipo} (${n1(estado.faltanPuntos)} puntos, ${n1(estado.faltanPt)} PT)`}
        </span>
        <span className="font-mono tabular-nums text-[var(--text-tertiary)]">meta {meta.pctMinimo}%</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div
          className={`h-full rounded-full ${estado.cumple ? "bg-[var(--data-success-500)]" : "bg-[var(--data-warning-500)]"}`}
          style={{ width: `${Math.min(100, estado.actual)}%` }}
        />
        {/* Marca de la meta: se ve de una si el lote llega o se queda corto. */}
        <div className="absolute inset-y-0 w-0.5 bg-[var(--text-primary)]" style={{ left: `${Math.min(100, meta.pctMinimo)}%` }} aria-hidden="true" />
      </div>

      {/* La misma pregunta en el tiempo */}
      {tendencia.puntos.length > 1 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              {meta.tipo} en tus últimas {tendencia.puntos.length} cubicaciones
            </span>
            <span className={`inline-flex items-center gap-1 text-xs font-bold ${tendencia.deltaPctMeta >= 0
              ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>
              {tendencia.deltaPctMeta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {tendencia.deltaPctMeta > 0 ? "+" : ""}{n1(tendencia.deltaPctMeta)} pts · promedio {n1(tendencia.promedioPctMeta)}%
            </span>
          </div>
          <ul className="flex items-end gap-1.5" style={{ height: 72 }}>
            {tendencia.puntos.map((p) => (
              <li key={p.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${p.nombre} · ${n1(p.pctMeta)}% ${meta.tipo} · ${n1(p.pieTablar)} PT`}>
                <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{Math.round(p.pctMeta)}</span>
                <div
                  className={`w-full rounded-t ${p.pctMeta >= meta.pctMinimo ? "bg-[var(--data-success-500)]" : "bg-[var(--data-warning-500)]"}`}
                  style={{ height: `${Math.max(3, (p.pctMeta / pico) * 44)}px` }}
                />
                <span className="truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fecha(p.fecha)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
