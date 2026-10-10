"use client";

/**
 * KpiTile — la cifra de una sección del Inicio (`DashboardSection.kpis`).
 *
 * Jerarquía (Brandon 2026-10-09: «revisa los KPIs… con buen diseño y formato»):
 *   rótulo chico + ⓘ  →  CIFRA grande  →  variación con flecha / línea chica.
 *
 * Sin dato (regla R3 del tablero): nada de «S/ 0.00» de relleno. La cifra sale
 * como «—» atenuado y el ⓘ dice por qué. Se activa con `value` null/«—»/vacío
 * o con `sinDato: true` (para cuando la cifra viene formateada en cero; decidirlo
 * con `kpiSinDato()` de `lib/admin/inicio/hay-datos`).
 *
 * La cifra escala con el ANCHO DE LA TARJETA (container query), no con la
 * pantalla: 4 tarjetas en media columna a 1280 px tienen menos sitio que 2 a
 * 400 px, y «S/ 12,345.50» tiene que entrar entera en los dos casos.
 */

import type { LucideIcon } from "@buleje/design-system/icons";
import { ArrowDownRight, ArrowUpRight, Minus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";

export interface SectionKPI {
  label: string;
  /** Cifra ya formateada («S/ 1,234.50», «12%»). null, "" o «—» = sin dato. */
  value: string | null;
  tone?: "primary" | "warning" | "success" | "neutral";
  /**
   * Explicación corta de la cifra (qué cuenta, por qué sale «—»). Se muestra
   * en un ⓘ al lado del rótulo (antes era un `title` que nadie veía).
   */
  hint?: string;
  /** Barrido emojis→íconos 2026-09-22: reemplaza un ★/🏆/⚠️ pegado al label. */
  icon?: LucideIcon;
  /** Variación en % contra el período anterior (12 = +12%). null = no se muestra. */
  delta?: number | null;
  /** Contra qué se compara: «vs mes anterior». */
  deltaLabel?: string;
  /** "inverse": bajar es buena noticia (gastos, mermas). "neutral": sin color. */
  deltaPolarity?: "normal" | "inverse" | "neutral";
  /** Línea chica bajo la cifra: «de 34 pedidos», «ticket S/ 25.00». */
  sub?: string;
  /** Fuerza «—» aunque `value` traiga texto (p. ej. «S/ 0.00» de relleno). */
  sinDato?: boolean;
  /** Qué dice el ⓘ cuando no hay dato. Default: genérico del período. */
  sinDatoHint?: string;
}

const SIN_DATO_HINT = "Todavía no hay movimientos para calcularlo en este período.";

export function esKpiSinDato(k: Pick<SectionKPI, "value" | "sinDato">): boolean {
  if (k.sinDato) return true;
  const v = k.value?.trim() ?? "";
  return v === "" || v === "—" || v === "-";
}

function colorCifra(tone: SectionKPI["tone"]): string {
  switch (tone) {
    case "warning":
      return "text-[var(--data-warning-500)]";
    case "success":
      return "text-[var(--data-success-500)]";
    case "primary":
      // --section-primary la pone DraggableSections (rotación por posición).
      return "text-[color:var(--section-primary,var(--text-primary))]";
    default:
      return "text-[var(--text-primary)]";
  }
}

function Variacion({ delta, label, polarity = "normal" }: { delta: number; label?: string; polarity?: SectionKPI["deltaPolarity"] }) {
  const sube = delta > 0;
  const baja = delta < 0;
  const Flecha = sube ? ArrowUpRight : baja ? ArrowDownRight : Minus;
  // La flecha lee el número; el color, si eso es buena o mala noticia.
  const buena = polarity === "inverse" ? baja : sube;
  const mala = polarity === "inverse" ? sube : baja;
  const color =
    polarity === "neutral" || (!buena && !mala)
      ? "text-[var(--text-tertiary)]"
      : buena
        ? "text-[var(--data-success)]"
        : "text-[var(--data-error)]";
  const signo = sube ? "+" : "";
  return (
    <p className={`mt-1.5 flex min-w-0 items-center gap-1 text-xs font-bold tabular-nums ${color}`}>
      <Flecha className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
      <span>
        {signo}
        {formatNumber(delta, { max: Math.abs(delta) < 10 ? 1 : 0 })}%
      </span>
      {label && <span className="truncate font-medium text-[var(--text-tertiary)]">{label}</span>}
    </p>
  );
}

export function KpiTile({ kpi }: { kpi: SectionKPI }) {
  const sinDato = esKpiSinDato(kpi);
  const ayuda = sinDato ? (kpi.sinDatoHint ?? kpi.hint ?? SIN_DATO_HINT) : kpi.hint;
  const Icono = kpi.icon;
  return (
    <div
      data-kpi-tile=""
      data-sin-dato={sinDato ? "true" : undefined}
      className={
        "@container min-w-0 border px-4 py-3.5 " +
        (sinDato
          ? "border-dashed border-[var(--rule-base)] bg-transparent"
          : "border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)]")
      }
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-1">
        {Icono && <Icono className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
        <p className="min-w-0 truncate text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]" title={kpi.label}>
          {kpi.label}
        </p>
        {ayuda && (
          <InfoTip title={kpi.label} what={ayuda} className="-my-1 shrink-0" ariaLabel={`Qué es «${kpi.label}»`} />
        )}
      </div>
      {sinDato ? (
        <p className="text-[length:var(--ts-xl)] font-extrabold leading-none text-[var(--text-tertiary)] opacity-70" aria-label="Sin dato">
          —
        </p>
      ) : (
        <p
          className={
            "truncate font-extrabold leading-none tabular-nums tracking-tight " +
            "text-[length:var(--ts-lg)] @min-[11rem]:text-[length:var(--ts-xl)] @min-[15rem]:text-[length:var(--ts-2xl)] " +
            colorCifra(kpi.tone)
          }
          title={kpi.value ?? undefined}
        >
          {kpi.value}
        </p>
      )}
      {!sinDato && typeof kpi.delta === "number" && Number.isFinite(kpi.delta) && (
        <Variacion delta={kpi.delta} label={kpi.deltaLabel} polarity={kpi.deltaPolarity} />
      )}
      {!sinDato && kpi.sub && (
        <p className="mt-1.5 truncate text-xs font-medium text-[var(--text-secondary)]" title={kpi.sub}>
          {kpi.sub}
        </p>
      )}
    </div>
  );
}

/**
 * Columnas de la fila de KPIs según CUÁNTOS son y el ancho de la SECCIÓN (la
 * sección es un `@container`): 3 KPIs ya no dejan un hueco en una grilla de 4.
 */
export function gridDeKpis(n: number): string {
  if (n <= 1) return "grid grid-cols-1 gap-3";
  if (n === 2) return "grid grid-cols-2 gap-3";
  if (n === 3) return "grid grid-cols-2 @xl:grid-cols-3 gap-3";
  if (n === 4) return "grid grid-cols-2 @3xl:grid-cols-4 gap-3";
  return "grid grid-cols-2 @xl:grid-cols-3 @5xl:grid-cols-5 gap-3";
}
