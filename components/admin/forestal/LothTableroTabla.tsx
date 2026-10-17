"use client";

/**
 * La lista de trozas del Control del permiso, con sus filtros pegados, el
 * lector de etiquetas en el buscador y la barra de la tanda (ADR-459).
 *
 * Merge 2026-10-04: la grilla es `LothTableroTrozasTabla` (las columnas que se
 * eligen, el orden por cabecera, la placa de la GTF); esta sección pone lo de
 * alrededor — buscador con pistola, especie, «Columnas», el aviso de lo que no
 * se pudo leer y la tanda — y le pasa la casilla y la fila resaltada.
 *
 * Los filtros van en la cabecera de cada columna (Brandon 07-10): el
 * desplegable suelto «Todas las especies» es ahora el filtro de la columna
 * Especie. El buscador se queda: es el lector de la pistola (Enter elige la
 * troza leída) y busca en seis columnas a la vez.
 *
 * A 400 px la tabla hace scroll propio dentro de su marco: la página no se
 * ensancha.
 */

import { useEffect, useId, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, ScanLine, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { sumaM3, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import type { LothTableroTabla } from "./hooks/use-loth-tablero-tabla";
import type { useTableroColumnas } from "./hooks/use-tablero-columnas";
import { BotonColumnas, PanelColumnas } from "./loth-tablero-partes";
import LothTableroTrozasTabla, { type NavTablero } from "./LothTableroTrozasTabla";
import { BarraFiltrosTabla } from "./filtros-tabla-forestal";

export type { NavTablero } from "./LothTableroTrozasTabla";

const TONO_LECTURA = {
  ok: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  aviso: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
} as const;

export default function LothTableroTabla({
  t,
  filas,
  total,
  columnas,
  faltante,
  nav,
  permisoDe,
  tanda,
  vacio = "Todavía no hay trozas registradas en el libro.",
}: {
  t: LothTableroTabla;
  /** Las que pasan los filtros, ya ordenadas por la cabecera elegida. */
  filas: readonly TrozaTablero[];
  /** Cuántas trozas tiene el permiso (sin filtros). */
  total: number;
  /** Qué columnas se ven y por cuál se ordena (`useTableroColumnas`). */
  columnas: ReturnType<typeof useTableroColumnas>;
  /** Qué no se pudo leer (guías, planes): esas columnas salen vacías. */
  faltante?: string | null;
  nav?: NavTablero;
  /** Con «Todos»: el nombre del permiso de cada troza (columna extra). */
  permisoDe?: (planId: string | null) => string;
  /** La barra de la tanda, entre los filtros y la tabla. */
  tanda?: React.ReactNode;
  /** Lo que dice la tabla sin ninguna troza («en este permiso» / «en el libro»). */
  vacio?: string;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const [verColumnas, setVerColumnas] = useState(false);
  const panelId = useId();
  const lecturaId = useId();

  /* La troza leída se trae a la vista: con 200 filas, resaltarla abajo no sirve. */
  useEffect(() => {
    if (!t.resaltada || !marco.current) return;
    const fila = marco.current.querySelector<HTMLElement>(`[data-troza="${CSS.escape(t.resaltada)}"]`);
    fila?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [t.resaltada]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Trozas{" "}
          <span className="font-normal text-[var(--text-tertiary)]">
            {filas.length} de {total} · {fmtM3(sumaM3(filas))} m³
          </span>
        </CardTitle>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input
              type="search"
              value={t.texto}
              onChange={(e) => t.setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  t.alLeer();
                }
              }}
              placeholder="Código, GTF, placa o etiqueta"
              aria-label="Buscar trozas"
              aria-describedby={lecturaId}
              className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:w-72"
            />
          </div>
          <InfoTip
            title="Escanear la etiqueta"
            what="Pasa la pistola por el QR de la etiqueta (o tipea el código y Enter): la troza se resalta y, si está en el patio, queda elegida. También busca por árbol, especie, GTF, placa o destino."
            example="Lee TROZA 85-TOR-C… → fila resaltada y elegida para la guía."
          />
          <BotonColumnas
            abierto={verColumnas}
            onToggle={() => setVerColumnas((v) => !v)}
            n={columnas.visibles.length}
            panelId={panelId}
          />
        </div>
      </div>

      <div id={lecturaId} aria-live="polite" className="min-h-0">
        {t.lectura && (
          <p className={`flex items-center gap-2 text-sm font-semibold ${TONO_LECTURA[t.lectura.tono]}`}>
            {t.lectura.texto}
            <button type="button" onClick={t.cerrarLectura} aria-label="Cerrar el aviso de la lectura" className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </p>
        )}
      </div>

      {verColumnas && (
        <PanelColumnas id={panelId} visibles={columnas.visibles} onAlternar={columnas.alternar} onRestablecer={columnas.restablecer} />
      )}

      {faltante && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          No se pudieron leer {faltante}: esas columnas salen vacías.
        </p>
      )}

      <BarraFiltrosTabla f={t.filtros} sinConteo />

      {tanda}

      {/* `hoja-grilla` (lo pone la grilla): a menos de 640 px el panel vuelve
          tarjetas toda tabla (`useMobileTableCards`); una lista de patio de 80
          trozas en tarjetas son metros de scroll. Sigue siendo tabla, con
          scroll propio en su caja (la caja la pone `DataTable`). */}
      <div ref={marco} className="min-w-0">
        <LothTableroTrozasTabla
          filas={filas}
          hayTrozas={total > 0}
          visibles={columnas.visibles}
          orden={columnas.orden}
          onOrdenar={columnas.ordenarPor}
          nav={nav}
          permisoDe={permisoDe}
          filtros={t.filtros}
          vacio={vacio}
          resaltada={t.resaltada}
          seleccion={{
            elegidas: t.elegidas,
            onElegir: t.alternarElegida,
            todasVisibles: t.todasVisiblesElegidas,
            algunaVisible: t.algunaVisibleElegida,
            hayElegibles: t.hayElegibles,
            onElegirVisibles: t.elegirVisibles,
          }}
        />
      </div>
    </section>
  );
}
