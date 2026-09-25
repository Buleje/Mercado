"use client";

/**
 * «Qué queda en el patio» — la primera tarjeta de Consumos › Patio.
 *
 * Brandon (2026-09-24): «hay muchos datos dispersos y mal estructurados».
 * Medido en `main` a 1600 px: cuatro bloques sueltos, cada uno con su caja y
 * su estilo, contaban la MISMA pila —«Por permiso» con su total, la tira de
 * lotes, la línea de «Indicadores» y la barra— y la tabla empezaba en y=1231.
 * Acá quedan juntos, en el orden en que se pregunta:
 *   1. el titular (cuántas trozas, m³, libres, añejas) con sus indicadores;
 *   2. de qué permiso es cada cosa (el clic filtra la tabla de abajo);
 *   3. qué lotes esperan la sierra.
 * Nada se sacó: el Excel sigue acá (y en «Opciones» de la tabla), la nota de
 * qué miden las cifras pasó a pie de la tabla por permiso.
 *
 * La tabla por permiso se pliega y se recuerda; con un lote elegido se pliega
 * sola (le devuelve la pantalla a la carga) y vuelve como estaba al soltarlo —
 * el mismo trato que ya tenían los indicadores.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileDown } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import CtpPatioPorPermiso from "./CtpPatioPorPermiso";
import CtpLotesTira from "./CtpLotesTira";
import type { EstadoPatioConsumos } from "./hooks/use-patio-consumos";

const nf = (n: number) => formatNumber(n);

export default function CtpConsumosPatioResumen({
  estado,
  indicadores,
  trabajando,
  onIr,
}: {
  estado: EstadoPatioConsumos;
  /** `CtpPatioKpis`: el botón «Indicadores» con el titular en una línea. */
  indicadores: React.ReactNode;
  /** Hay un lote elegido: la tabla por permiso y la tira de lotes ceden la pantalla. */
  trabajando: boolean;
  onIr?: (vista: string) => void;
}) {
  const { lotes, carga, porPermiso } = estado;
  const idTitulo = useId();
  const idTabla = useId();
  const [abierta, setAbierta] = useLocalStorage<boolean>("ctp-consumos-por-permiso", true);
  /* Plegada por el trabajo, no por el operador: no se guarda. */
  const [plegadaPorTrabajo, setPlegadaPorTrabajo] = usePlegadoPorTrabajo(trabajando);
  const verTabla = abierta && !plegadaPorTrabajo;
  const alternar = () => {
    if (plegadaPorTrabajo) setPlegadaPorTrabajo(false);
    else setAbierta((v) => !v);
  };

  const { filas, totales } = porPermiso;
  const conPermiso = filas.filter((f) => f.permiso != null).length;
  const resumenPlegado =
    `${nf(conPermiso)} permiso${conPermiso === 1 ? "" : "s"}` +
    (totales.masVieja ? ` · la más vieja lleva ${nf(totales.masVieja.dias)} días` : "") +
    (totales.porRecepcionar.trozas > 0
      ? ` · ${nf(totales.porRecepcionar.trozas)} troza${totales.porRecepcionar.trozas === 1 ? "" : "s"} (${fmtM3(totales.porRecepcionar.m3)} m³) por recepcionar`
      : "");

  return (
    <section
      aria-labelledby={idTitulo}
      className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" id={idTitulo} className="text-base font-bold text-[var(--text-primary)]">
          Qué queda en el patio
        </CardTitle>
        <button
          type="button"
          onClick={() => void estado.descargarExcel()}
          disabled={filas.length === 0 || estado.descargando}
          title="Descargar el patio por permiso (Excel): una hoja por permiso con sus trozas"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50"
        >
          <FileDown className="h-4 w-4" aria-hidden />
          {estado.descargando ? "Generando…" : "Excel por permiso"}
        </button>
      </header>

      {indicadores}

      <div className="space-y-2">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={verTabla}
          aria-controls={idTabla}
          className="flex min-h-10 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-1 text-left text-sm transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${verTabla ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="font-bold text-[var(--text-primary)]">Por permiso</span>
          {/* Plegada, la línea sigue diciendo lo que la tabla tiene: plegar no es esconder el dato. */}
          <span className="text-[var(--text-secondary)]">
            {verTabla ? "Clic en un permiso para ver solo sus trozas" : resumenPlegado}
          </span>
        </button>
        {verTabla && (
          <div id={idTabla}>
            <CtpPatioPorPermiso
              sinCabecera
              filas={filas}
              totales={totales}
              activos={estado.patio.permiso}
              onElegir={estado.alternarPermiso}
              onRecepcionar={onIr ? () => onIr("ingresos") : undefined}
              cargando={lotes.cargando && lotes.trozas.length === 0}
              error={lotes.error}
            />
          </div>
        )}
      </div>

      {/* Lo que TODAVÍA no entró a la sierra: el semáforo y el camino (ADR-334). */}
      {onIr && !trabajando && (
        <CtpLotesTira enLinea lotes={carga.lotesAbiertos} cargando={lotes.cargando} error={lotes.error} onIr={() => onIr("lotes")} />
      )}
    </section>
  );
}

/**
 * Se pliega al ARRANCAR el trabajo y se despliega al soltarlo. Depende sólo de
 * `trabajando`: si dependiera del estado, reabrirla a mano la volvería a
 * cerrar en el render siguiente (mismo criterio que `CtpKpisPlegables`).
 */
function usePlegadoPorTrabajo(trabajando: boolean): [boolean, (v: boolean) => void] {
  const [plegada, setPlegada] = useState(false);
  const previo = useRef(trabajando);
  useEffect(() => {
    if (trabajando && !previo.current) setPlegada(true);
    if (!trabajando && previo.current) setPlegada(false);
    previo.current = trabajando;
  }, [trabajando, setPlegada]);
  return [plegada, setPlegada];
}
