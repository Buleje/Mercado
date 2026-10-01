"use client";

/**
 * El balance físico de Producción: qué entró a la sierra, qué salió, y a qué
 * distancia del techo quedó el rendimiento.
 *
 * ¿Por qué un bloque y no tres tarjetas más? Porque «Materia prima 142.26»,
 * «Producido 78.12» y «Merma 65.81» estaban una al lado de la otra invitando a
 * restarlas — y no se restan: 142.26 − 78.12 da 64.14, mientras que la merma
 * declarada sale de un subconjunto (sólo las corridas con entrada Y salida en
 * m³). Tres cifras contiguas que no cierran se leen como un error del sistema.
 * Acá el universo de cada número está DENTRO de la misma pieza que lo muestra.
 *
 * Y el rendimiento deja de ser un número suelto: lo que decide el aserradero no
 * es «53.7 %», es cuánto le queda hasta el techo de 56 % (ADR-358) — un tope de
 * la plaza que el servidor también hace cumplir, no una meta a superar.
 */

import { Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { RENDIMIENTO_PLAUSIBLE_MIN } from "@/lib/forestal/loctp-catalogos";
import { TOPE_RENDIMIENTO_PCT } from "@/lib/forestal/vincular-produccion";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { formatNumber } from "@/lib/format";
/* Dos decimales y no los tres de `fmtM3`: son totales de PERÍODO, y al lado
   vive la tarjeta «En planta» que siempre mostró dos. El mismo número escrito
   de dos formas a diez centímetros se lee como dos números distintos. Los tres
   decimales quedan donde miden una troza, que es donde esa precisión existe. */
const n2 = (v: number) => formatNumber(v, 2);

/** Hasta dónde llega la escala del gauge. El techo (56) tiene que caer adentro
 *  con aire a la derecha: si el tope quedara pegado al borde, «pasarse» no se
 *  vería como pasarse. */
const ESCALA_MAX = 70;

const pos = (pct: number) => `${Math.min(100, Math.max(0, (pct / ESCALA_MAX) * 100))}%`;

/**
 * El rendimiento contra su techo, en barra.
 *
 * Tres zonas y una línea: debajo de 40 es bajo para aserrío, entre 40 y 56 es
 * la franja de trabajo, y pasando 56 el libro lo rechaza. La aguja se pinta del
 * tono del veredicto que ya calcula `juzgarRendimientoLote` — el mismo que usa
 * la tarjeta, para que no puedan contradecirse.
 */
export function GaugeRendimiento({
  pct,
  tono,
  veredicto,
  compacto = false,
}: {
  pct: number | null;
  tono: "ok" | "aviso" | "malo" | "neutro";
  veredicto: string;
  compacto?: boolean;
}) {
  const color =
    tono === "ok"
      ? "var(--data-success-500)"
      : tono === "aviso"
        ? "var(--data-warning-500)"
        : tono === "malo"
          ? "var(--data-error-500)"
          : "var(--text-tertiary)";
  const margen = pct == null ? null : TOPE_RENDIMIENTO_PCT - pct;

  if (compacto) {
    /* La versión de la línea de resumen: se ve con el panel CERRADO, que es
       como se mira la pestaña el 90 % del tiempo. Sin esto, el número que
       gobierna la producción sólo existía detrás de un botón. */
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5" title={`${veredicto} · techo ${TOPE_RENDIMIENTO_PCT} %`}>
        <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pos(pct ?? 0), background: color }} />
          <span className="absolute inset-y-0 w-px bg-[var(--text-primary)]" style={{ left: pos(TOPE_RENDIMIENTO_PCT) }} />
        </span>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {pct == null ? "—" : `${pct.toFixed(1)} %`}
        </span>
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col justify-center gap-2 rounded-xl bg-[var(--surface-sunken)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold tracking-wide text-[var(--text-tertiary)] uppercase">
          <Scale className="h-3.5 w-3.5" aria-hidden /> Rendimiento
        </span>
        <span className="text-2xl leading-none font-bold tabular-nums" style={{ color }}>
          {pct == null ? "—" : `${pct.toFixed(1)}%`}
        </span>
      </div>

      <div className="relative h-3 w-full rounded-full bg-[var(--surface-raised)] ring-1 ring-[var(--rule-base)] ring-inset">
        {/* La franja de trabajo: entre «bajo para aserrío» y el techo. */}
        <span
          className="absolute inset-y-0 rounded-full bg-[var(--data-success-500)]/12"
          style={{ left: pos(RENDIMIENTO_PLAUSIBLE_MIN), right: `calc(100% - ${pos(TOPE_RENDIMIENTO_PCT)})` }}
          aria-hidden
        />
        {pct != null && (
          <span
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-[var(--dur-slow)]"
            style={{ width: pos(pct), background: color }}
            aria-hidden
          />
        )}
        {/* El techo, en duro. Es la única línea sólida de la barra: lo que no se
            puede pasar tiene que verse distinto de lo que se puede. */}
        <span
          className="absolute -inset-y-1 w-0.5 rounded-full bg-[var(--text-primary)]"
          style={{ left: pos(TOPE_RENDIMIENTO_PCT) }}
          aria-hidden
        />
      </div>

      <div className="flex items-baseline justify-between gap-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <span className="truncate">{veredicto}</span>
        <span className="shrink-0 tabular-nums">
          {margen == null
            ? `techo ${TOPE_RENDIMIENTO_PCT} %`
            : margen >= 0
              ? `quedan ${margen.toFixed(1)} pts al techo de ${TOPE_RENDIMIENTO_PCT} %`
              : `${Math.abs(margen).toFixed(1)} pts POR ENCIMA del techo`}
        </span>
      </div>
    </div>
  );
}

/**
 * Lo que entró y lo que salió, en una sola barra.
 *
 * El total de la barra es la materia prima: el producto es la parte llena y el
 * resto —lo que la sierra se comió— la parte vacía. La merma DECLARADA se dice
 * abajo con su universo al lado, porque casi nunca se mide sobre todas las
 * corridas y presentarla como si fuera «142.26 menos 78.12» sería inventar.
 */
export default function CtpBalanceProduccion({
  consumido,
  producido,
  piezas,
  merma,
  mermaPct,
  mermaSobre,
  corridas,
  avgRend,
  tono,
  veredicto,
}: {
  consumido: number;
  producido: number;
  piezas: number;
  merma: number;
  mermaPct: number;
  /** Sobre cuántas corridas se pudo medir la merma (entrada Y salida en m³). */
  mermaSobre: number;
  /** Cuántas corridas hay en total en el período. */
  corridas: number;
  avgRend: number;
  tono: "ok" | "aviso" | "malo" | "neutro";
  veredicto: string;
}) {
  const hayEntrada = consumido > 0;
  const pctProducido = hayEntrada ? Math.min(100, (producido / consumido) * 100) : 0;
  /* El resto de ESTA barra, que no es la merma declarada: la barra habla del
     período entero y la merma de su subconjunto. Se nombra distinto a propósito. */
  const resto = Math.max(0, consumido - producido);
  /* La merma se midió sobre TODAS las corridas del período, o sobre algunas. La
     diferencia cambia cómo se lee el número, así que se dice. */
  const mermaParcial = mermaSobre > 0 && mermaSobre < corridas;

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
      <div className="flex min-w-0 flex-col justify-center gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[length:var(--ts-2xs)] font-bold tracking-wide text-[var(--text-tertiary)] uppercase">
            De la sierra salió
          </span>
          <span className="text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
            {corridas} corrida{corridas === 1 ? "" : "s"} en el período
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-3xl leading-none font-bold tabular-nums text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            {n2(producido)} m³
          </span>
          <span className="text-sm text-[var(--text-secondary)]">
            de <span className="font-bold tabular-nums text-[var(--text-primary)]">{n2(consumido)} m³</span> que entraron
          </span>
        </div>

        {/* Una sola barra: lo lleno es producto, lo vacío es lo que se fue en el
            corte. Dos números que SÍ suman al total que dice arriba. */}
        <div
          className="relative h-6 w-full overflow-hidden rounded-lg bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-base)] ring-inset"
          role="img"
          aria-label={`De ${n2(consumido)} m³ que entraron salieron ${n2(producido)} m³ de producto`}
        >
          <span
            className="absolute inset-y-0 left-0 bg-linear-to-r from-[var(--data-success-500)] to-[var(--data-success-700)] transition-[width] duration-[var(--dur-slow)]"
            style={{ width: `${pctProducido}%` }}
            aria-hidden
          />
          {pctProducido >= 18 && (
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-bold text-white tabular-nums">
              {pctProducido.toFixed(1)} % producto
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[length:var(--ts-2xs)]">
          <span className="text-[var(--text-secondary)] tabular-nums">
            {piezas > 0 ? `${formatNumber(piezas)} piezas · ` : ""}
            {formatNumber(pieTablarDe(consumido))} pt a la sierra
          </span>
          {mermaSobre > 0 ? (
            <span
              className="text-[var(--text-tertiary)] tabular-nums"
              title={
                mermaParcial
                  ? "La merma sólo se puede medir donde la corrida declara entrada Y salida en m³. Las demás no entran en esta cuenta."
                  : "Todas las corridas del período declaran entrada y salida en m³."
              }
            >
              Merma medida <span className="font-bold text-[var(--text-secondary)]">{n2(merma)} m³</span> ({mermaPct.toFixed(1)} %)
              {mermaParcial ? ` · sólo ${mermaSobre} de ${corridas} corridas` : " · todas las corridas"}
            </span>
          ) : (
            <span className="text-[var(--text-tertiary)]">
              Merma sin medir · ninguna corrida declara entrada y salida en m³
            </span>
          )}
        </div>

        {/* El resto de la barra sólo se nombra cuando NO coincide con la merma
            declarada: si coinciden, repetirlo es ruido; si difieren, callarlo
            es lo que hacía parecer que el sistema se contradecía. */}
        {hayEntrada && mermaSobre > 0 && Math.abs(resto - merma) >= 0.01 && (
          <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
            {n2(resto)} m³ del período no están en la merma medida.
            <InfoTip
              title="Por qué no coinciden"
              what={`La barra reparte los ${n2(consumido)} m³ del período entero; la merma de arriba se mide sólo donde hay entrada y salida en m³.`}
            />
          </p>
        )}
      </div>

      <GaugeRendimiento pct={avgRend > 0 ? avgRend : null} tono={tono} veredicto={veredicto} />
    </div>
  );
}
