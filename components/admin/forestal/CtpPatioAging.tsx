"use client";

/**
 * CtpPatioAging — qué madera del LIBRO está parada y hace cuánto, guía por guía.
 *
 * La troza sin procesar se degrada (mancha azul, insectos, rajaduras) y encima
 * inmoviliza capital: esto lista las guías con saldo sin consumir de la más
 * vieja a la más nueva, con el valor inmovilizado, para procesar primero lo
 * más viejo.
 *
 * Tres cosas cambiaron el 24-09 (ADR-431):
 *  · **Se rotula como lo que es**: m³ del libro por guía, NO piezas del patio.
 *    En Blas daba 125,22 m³ al lado de un patio físico de 135,59 y ninguna de
 *    las dos cifras decía cuál era cuál.
 *  · **La escala de días es la única del libro** (0-14 · 15-29 · 30-59 · 60+),
 *    y cada pastilla dice su severidad en texto, no sólo en color.
 *  · **No se pide solo ni se esconde**: los datos llegan por props (el
 *    «Recargar» de la cabecera los refresca), y cargando o con error se ve un
 *    esqueleto o el motivo, en vez de un `return null` que hacía saltar la página.
 */

import { CardTitle } from "@buleje/design-system";
import { AlertCircle, ChevronDown, Clock } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { ResumenAntiguedad } from "@/lib/forestal/antiguedad-por-guia";
import type { EstadoFuente } from "@/lib/forestal/capacidad-de-planta";
import { formatCurrency, formatNumber } from "@/lib/format";
import AntiguedadGuiasTabla from "./saldos/AntiguedadGuiasTabla";
import AntiguedadTramos from "./saldos/AntiguedadTramos";

const m3 = (v: number) => `${formatNumber(v, 3)} m³`;
const dinero = (v: number, moneda = "PEN") =>
  moneda === "USD" ? `US$ ${formatNumber(v, 2)}` : formatCurrency(v);

export default function CtpPatioAging({
  resumen,
  estado,
  error,
  especie,
  onValorizar,
}: {
  resumen: ResumenAntiguedad;
  estado: EstadoFuente;
  error: string | null;
  /** El recorte por especie de los indicadores, si hay: para decirlo en el vacío. */
  especie?: string;
  /** Lleva a Rentabilidad › Valorizar ingresos, donde se cargan los costos. */
  onValorizar?: () => void;
}) {
  const { filas, totM3, totValor, valorParcial, m3ConCosto, m3SinCosto, guiasSinCosto, cobertura } =
    resumen;
  const idTitulo = "saldos-antiguedad-titulo";
  const idTabla = "saldos-antiguedad-guias";
  /* La tabla guía por guía se abre a pedido y se recuerda: con 20 guías eran
     880 px a 1280 y 4 000 px de tarjetas a 400. Los tramos de arriba ya dicen
     cuánto hay en cada edad; la lista es para ir a buscar una guía. */
  const [verGuias, setVerGuias] = useLocalStorage<boolean>("saldos-antiguedad-ver-guias", false);

  return (
    <section
      aria-labelledby={idTitulo}
      aria-busy={estado === "cargando" || undefined}
      className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle as="h3" id={idTitulo} className="flex items-center gap-2 text-base font-bold">
          <Clock className="h-4 w-4 shrink-0" aria-hidden /> Antigüedad por guía · m³ del libro (no
          piezas)
        </CardTitle>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Guías con saldo sin consumir, de la más vieja a la más nueva. Es el m³ del libro por guía:
          no cuadra con el patio pieza por pieza de «Patio por permiso», y no se suman.
        </p>
        {filas.length > 0 && (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">Inmovilizado: {m3(totM3)}</span>
            {totValor > 0 && (
              <>
                {" · "}
                <span className="whitespace-nowrap font-bold text-[var(--text-primary)]">
                  {dinero(totValor)}
                </span>{" "}
                sobre los {m3(m3ConCosto)} que tienen costo cargado
              </>
            )}
          </p>
        )}
      </div>

      {estado === "cargando" && filas.length === 0 && (
        <div role="status" aria-label="Cargando la antigüedad por guía" className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-[var(--surface-sunken)]" />
          ))}
        </div>
      )}

      {estado === "error" && (
        <p
          role="alert"
          className="flex items-start gap-2 px-4 py-3 text-sm text-[var(--data-error-ink)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          No se pudo leer la antigüedad por guía{error ? `: ${error}` : ""}. Usa «Recargar» arriba.
        </p>
      )}

      {estado === "ok" && filas.length === 0 && (
        <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">
          {especie
            ? `Ninguna guía de ${especie} tiene saldo sin consumir en el libro.`
            : "Ninguna guía tiene saldo sin consumir en el libro."}
        </p>
      )}

      {filas.length > 0 && (
        <>
          {resumen.varadas.guias > 0 && (
            <p className="flex items-start gap-2 border-b border-[var(--rule-soft)] bg-[var(--data-error-500)]/10 px-4 py-2 text-sm font-medium text-[var(--data-error-ink)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {resumen.varadas.guias} {resumen.varadas.guias === 1 ? "guía lleva" : "guías llevan"}{" "}
              60 días o más sin procesar ({m3(resumen.varadas.m3)}): riesgo de degradación.
            </p>
          )}

          {m3SinCosto > 0.01 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule-soft)] bg-[var(--data-warning-500)]/10 px-4 py-2 text-sm text-[var(--data-warning-ink)]">
              <p className="min-w-0 flex-1">
                <strong>
                  {m3(m3SinCosto)} ({formatNumber(100 - cobertura, 0)} %) no tienen costo cargado
                </strong>{" "}
                — {guiasSinCosto} {guiasSinCosto === 1 ? "guía" : "guías"} con factura pendiente.
                {totValor > 0
                  ? " El importe de arriba es un piso: lo parado vale más, no menos."
                  : " Por eso no hay importe: sin costo no se inventa uno."}
              </p>
              {onValorizar && (
                <button
                  type="button"
                  onClick={onValorizar}
                  className="inline-flex min-h-8 shrink-0 items-center rounded-lg border-2 border-current px-3 text-xs font-bold transition-colors hover:bg-[var(--data-warning-500)]/15"
                >
                  Cargar costos
                </button>
              )}
            </div>
          )}

          <AntiguedadTramos tramos={resumen.tramos} totM3={totM3} />

          <div className="border-b border-[var(--rule-soft)] px-4 py-2">
            <button
              type="button"
              onClick={() => setVerGuias(!verGuias)}
              aria-expanded={verGuias}
              aria-controls={idTabla}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
            >
              {verGuias
                ? "Ocultar las guías"
                : `Ver las ${filas.length} ${filas.length === 1 ? "guía" : "guías"}, de la más vieja a la más nueva`}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${verGuias ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
          </div>
          {verGuias && (
            <div id={idTabla}>
              <AntiguedadGuiasTabla filas={filas} idTitulo={idTitulo} />
            </div>
          )}
          {valorParcial && (
            <p className="px-4 py-2 text-xs text-[var(--text-tertiary)]">
              * Valor parcial: cubre solo las guías con costo cargado. Los m³ sí están completos.
            </p>
          )}
        </>
      )}
    </section>
  );
}
