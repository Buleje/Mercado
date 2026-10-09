"use client";

/**
 * «¿Cuadra?» — el parte del día que arma el servidor, a la vista:
 *  1. Caja contra VENTAS del sistema (cruce por venta): cuántas ventas no
 *     pasaron por la caja y cuánto efectivo es.
 *  2. De dónde vino y a dónde fue el efectivo (venta, adelanto, gasto, retiro
 *     del dueño…), con el esperado como total.
 * No calcula nada: muestra `ParteDelDia` tal cual.
 */
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Check, ChevronDown, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ParteDelDia } from "@/lib/caja/parte-del-dia";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fmt } from "./tipos";

interface Props {
  parte: ParteDelDia | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  /** En el detalle de una caja vieja va sin borde propio. */
  compacto?: boolean;
}

export function CajaCuadreDelDia({ parte, cargando, error, onReintentar, compacto }: Props) {
  const [verSinCaja, setVerSinCaja] = useState(false);
  const marco = compacto
    ? ""
    : "bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4 sm:p-5";

  if (!parte) {
    return (
      <div className={cn(marco, "text-sm text-[var(--text-secondary)]")}>
        {error ? (
          <span className="flex flex-wrap items-center gap-2" role="alert">
            <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)]" aria-hidden /> {error}
            <button
              type="button"
              onClick={onReintentar}
              className="font-semibold text-primary hover:underline"
            >
              Reintentar
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cruzando la caja con las
            ventas…
          </span>
        )}
      </div>
    );
  }

  const c = parte.conciliacion;
  const filas = parte.porOrigen.filter((l) => l.entraEfectivo || l.saleEfectivo || l.otrosMedios);

  return (
    <section
      className={cn(marco, "grid gap-4", !compacto && "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}
      aria-busy={cargando}
    >
      {/* 1. Caja contra ventas */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-3">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
            ¿Cuadra con las ventas?
          </CardTitle>
          <InfoTip
            what="Cruza cada venta del sistema hecha desde que abriste la caja con los movimientos de venta de la caja."
            affects="Una venta que no pasó por la caja es plata vendida que el cajón no registró: se vendió con la caja cerrada o falló el anotado."
            example="El POS vendió 14, la caja tiene 13: falta 1 venta de S/ 12.50 en efectivo."
          />
        </div>
        <div
          className={cn(
            "rounded-xl border px-3 py-2.5 flex items-start gap-2",
            c.cuadra
              ? "border-[var(--data-success-500)]/30 bg-primary/10"
              : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10",
          )}
        >
          {c.cuadra ? (
            <Check
              className="h-5 w-5 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              aria-hidden
            />
          ) : (
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              aria-hidden
            />
          )}
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {c.cuadra
              ? `Todas las ventas pasaron por la caja (${c.ventasSistema.n}).`
              : c.sinCaja.n > 0
                ? `${c.sinCaja.n} venta${c.sinCaja.n === 1 ? "" : "s"} no pasaron por la caja: ${fmt(c.sinCaja.total)}${c.sinCaja.efectivo ? ` (${fmt(c.sinCaja.efectivo)} en efectivo)` : ""}.`
                : `El efectivo de las ventas no coincide: ${c.diferenciaEfectivo >= 0 ? "+" : "−"}${fmt(Math.abs(c.diferenciaEfectivo))}.`}
            {c.truncado && " Son demasiadas ventas: las cifras son un mínimo."}
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
            <dt className="text-xs text-[var(--text-tertiary)]">Ventas del sistema</dt>
            <dd className="font-bold tabular-nums text-[var(--text-primary)]">
              {fmt(c.ventasSistema.total)}{" "}
              <span className="font-normal text-[var(--text-tertiary)]">· {c.ventasSistema.n}</span>
            </dd>
          </div>
          <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
            <dt className="text-xs text-[var(--text-tertiary)]">Anotadas en la caja</dt>
            <dd className="font-bold tabular-nums text-[var(--text-primary)]">
              {fmt(c.ventasEnCaja.total)}{" "}
              <span className="font-normal text-[var(--text-tertiary)]">· {c.ventasEnCaja.n}</span>
            </dd>
          </div>
        </dl>
        {c.sinCaja.n > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setVerSinCaja((v) => !v)}
              aria-expanded={verSinCaja}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              {verSinCaja ? "Ocultar" : "Ver"} las ventas sin caja
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", verSinCaja && "rotate-180")}
                aria-hidden
              />
            </button>
            {verSinCaja && (
              <ul className="mt-2 divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-soft)] text-sm">
                {c.sinCaja.muestra.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-xs text-[var(--text-tertiary)]">
                      {formatTime(v.createdAt)}
                    </span>
                    <span className="capitalize text-[var(--text-secondary)]">{v.medio}</span>
                    <span className="ml-auto font-bold tabular-nums text-[var(--text-primary)]">
                      {fmt(v.total)}
                    </span>
                  </li>
                ))}
                {c.sinCaja.n > c.sinCaja.muestra.length && (
                  <li className="px-3 py-2 text-xs text-[var(--text-tertiary)]">
                    y {c.sinCaja.n - c.sinCaja.muestra.length} más
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 2. De dónde vino el efectivo */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-3">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
            De dónde vino el efectivo
          </CardTitle>
          <InfoTip
            what="Cada movimiento de la caja agrupado por su origen. «Entró» y «Salió» son efectivo del cajón; «Otros medios» es Yape, Plin, tarjeta o transferencia (no toca el cajón)."
            affects="La fila del total es el esperado en el cajón: lo que tienes que contar al cerrar."
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-tertiary)]">
                <th className="py-1.5 pr-2 font-semibold">Origen</th>
                <th className="py-1.5 px-2 font-semibold text-right">Entró</th>
                <th className="py-1.5 px-2 font-semibold text-right">Salió</th>
                <th className="py-1.5 pl-2 font-semibold text-right">Otros medios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {filas.map((l) => (
                <tr key={l.clave}>
                  <td className="py-1.5 pr-2 text-[var(--text-primary)]">
                    {l.etiqueta}{" "}
                    <span className="text-xs text-[var(--text-tertiary)]">· {l.n}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                    {l.entraEfectivo ? fmt(l.entraEfectivo) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap text-[var(--data-error-500)]">
                    {l.saleEfectivo ? fmt(l.saleEfectivo) : "—"}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-[var(--text-secondary)]">
                    {l.otrosMedios ? fmt(l.otrosMedios) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--rule-strong)]">
                <td className="py-2 pr-2 font-bold text-[var(--text-primary)]">
                  Esperado en el cajón
                </td>
                <td
                  colSpan={3}
                  className="py-2 pl-2 text-right font-extrabold tabular-nums text-primary"
                >
                  {fmt(parte.esperado)}
                  {parte.contado != null && (
                    <span
                      className={cn(
                        "ml-2 text-sm font-bold",
                        Math.abs(parte.diferencia ?? 0) < 0.5
                          ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                          : "text-[var(--data-error-500)]",
                      )}
                    >
                      contado {fmt(parte.contado)} ({(parte.diferencia ?? 0) >= 0 ? "+" : "−"}
                      {fmt(Math.abs(parte.diferencia ?? 0))})
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
