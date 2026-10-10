"use client";

import { ArrowRight, TriangleAlert } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import { porcentaje } from "@/lib/admin/inicio/formato-tablero";
import { valorConDato } from "@/lib/admin/inicio/hay-datos";
import type { PermisoInicio } from "@/lib/forestal/inicio-forestal";
import { DashboardSection } from "./_shared";
import { permisoConDato } from "./use-forestal-inicio";

const m3 = (n: number) => `${formatNumber(n, 2)} m³`;
const pct = (parte: number, base: number) => (base > 0 ? Math.min(100, Math.max(0, (parte / base) * 100)) : 0);
const tipoDe = (t: string) => (t === "PLANTACION" ? "Plantación" : t);

/* Talado = pizarra (lo que entra, como «Ingresado» del gráfico) y despachado =
   coral (lo que sale): `.charts-forestal` los fija en claro y en oscuro. */
const COLOR_TALADO = "var(--section-primary)";
const COLOR_DESPACHADO = "var(--section-amber)";

/**
 * Los permisos vigentes del LO-TH: lo autorizado (o registrado, en una
 * plantación) contra lo talado y lo despachado.
 *
 * Cada fila es el TOTAL de la cascada de Control del permiso (`cascadaDelPlan`
 * sobre el balance del plan): las mismas cifras que esa pantalla, desde que el
 * permiso empezó — no se recortan al período del Inicio, porque un saldo de
 * permiso a medias no dice cuánto queda.
 *
 * Vacíos (09-10): un permiso sin volumen ni tala no es una fila de barras en
 * cero, es un nombre en la línea de abajo; si ninguno tiene nada, el bloque se
 * oculta (queda en «Gráficos › Sin datos todavía»).
 */
export function ForestalPermisos({ permisos, onIr }: { permisos: PermisoInicio[]; onIr: () => void }) {
  const conDato = permisos.filter(permisoConDato);
  const sinVolumen = permisos.filter((p) => !permisoConDato(p));
  return (
    <DashboardSection
      chartId="forestal.permisos"
      hasData={conDato.length > 0}
      className="charts-forestal"
      kicker="Libro TH · acumulado"
      title="Permisos vigentes"
      description="Cada barra es el total de «Control del permiso» del Libro TH: lo autorizado (o lo registrado, si es plantación) y cuánto se taló y se despachó de eso, desde que empezó el permiso y no sólo en el período de arriba. Ejemplo: autorizado 320 m³ y talado 80 m³ = 25 %, quedan 240 m³ en pie."
      rightSlot={
        <button
          type="button"
          onClick={onIr}
          aria-label="Ver control del permiso"
          className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center gap-1.5 px-2 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)] sm:w-auto sm:px-3"
        >
          {/* A 400 px el texto partía «Permisos vigentes» en dos renglones: queda la flecha. */}
          <span className="hidden sm:inline">Ver control</span> <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      }
    >
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Qué es cada color">
        <Leyenda color={COLOR_TALADO} texto="Talado" />
        <Leyenda color={COLOR_DESPACHADO} texto="Despachado" />
      </ul>
      <ul className="divide-y divide-[var(--rule-soft)] dark:divide-[var(--rule-base)]">
        {conDato.map((p) => (
          <FilaPermiso key={p.id} p={p} />
        ))}
      </ul>
      {sinVolumen.length > 0 && (
        <p className="mt-3 border-t border-[var(--rule-soft)] pt-3 text-xs text-[var(--text-tertiary)] dark:border-[var(--rule-base)]">
          Todavía sin volumen ni tala:{" "}
          <span className="font-semibold text-[var(--text-secondary)]">
            {sinVolumen.map((p) => `${p.numero} (${tipoDe(p.tipo)})`).join(" · ")}
          </span>
        </p>
      )}
    </DashboardSection>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="font-bold text-[var(--text-primary)]">{texto}</span>
    </li>
  );
}

function FilaPermiso({ p }: { p: PermisoInicio }) {
  const base = p.tipo === "PLANTACION" ? "registrado" : "autorizado";
  const conBase = p.baseM3 > 0;
  const talado = valorConDato(p.taladoM3);
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 truncate text-base font-bold text-[var(--text-primary)]">
          {p.numero}
          <span className="ml-2 text-xs font-semibold text-[var(--text-tertiary)]">{tipoDe(p.tipo)}</span>
        </p>
        <p className="text-sm tabular-nums text-[var(--text-secondary)]">
          {!conBase ? (
            <>Sin volumen {base} cargado</>
          ) : talado && p.pctTalado != null ? (
            <>
              <strong className="text-lg font-extrabold text-[var(--text-primary)]">{porcentaje(p.pctTalado, 1)}</strong> talado
            </>
          ) : (
            <>Sin talar todavía</>
          )}
        </p>
      </div>
      {conBase && (
        <div className="mt-2 space-y-1" aria-hidden>
          <div className="h-3 overflow-hidden rounded-[var(--radius-xs)] bg-[var(--surface-sunken)]">
            <div className="h-full" style={{ width: `${pct(p.taladoM3, p.baseM3)}%`, background: COLOR_TALADO }} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-[var(--radius-xs)] bg-[var(--surface-sunken)]">
            <div className="h-full" style={{ width: `${pct(p.despachadoM3, p.baseM3)}%`, background: COLOR_DESPACHADO }} />
          </div>
        </div>
      )}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
        <span>Talado {talado ? <strong className="text-[var(--text-primary)]">{m3(p.taladoM3)}</strong> : "—"}</span>
        <span>
          Despachado{" "}
          {valorConDato(p.despachadoM3) ? <strong className="text-[var(--text-primary)]">{m3(p.despachadoM3)}</strong> : "—"}
        </span>
        {conBase && (
          <span>
            En pie <strong className="text-[var(--text-primary)]">{m3(p.enPieM3)}</strong> de {m3(p.baseM3)} {base}s
          </span>
        )}
      </p>
      {(p.excedido || p.taladoSinRegistrarM3 > 0) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {p.excedido
            ? `Se taló o despachó más de lo ${base}.`
            : `${m3(p.taladoSinRegistrarM3)} talados de especies que el permiso no tiene cargadas.`}
        </p>
      )}
    </li>
  );
}
