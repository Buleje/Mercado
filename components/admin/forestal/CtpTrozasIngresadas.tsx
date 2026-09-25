"use client";

/**
 * Todas las trozas que entraron al patio, en una tabla (ADR-341).
 *
 * Es «el montón»: lo que las guías recepcionadas dejaron y todavía está por
 * aserrar, con los datos que se miran parado frente a la pila y de qué guía vino
 * cada una. La misma tabla es el picker: se tildan las piezas que entran a la
 * sierra. Una lista para mirar y otra para elegir se contradirían.
 *
 * El filtro y las cifras viven en la vista (ADR-345); acá llegan las filas ya
 * elegidas. Los autofiltros de la cabecera (estilo Excel) escriben el MISMO
 * estado que el panel «Filtros»: Guía, Permiso, Especie, Días en el patio
 * (tramos de la escala única) y Medidas (rango de largo y de diámetro, cada uno
 * oculto si ninguna fila trae el dato).
 */

import { Fragment, useId, useMemo, useState } from "react";
import { ChevronRight, PackageOpen } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { agruparTrozas, type AgrupacionPatio, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarAserrableDe } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { FILAS_POR_PAGINA_MOVIL, esPantallaAngosta } from "@/lib/forestal/tabla-paginacion";
import type { FacetaOpcion, Rango } from "@/components/admin/shared/filtros-columna";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, usePaginacion } from "./ctp-tabla";
import CtpTrozasIngresadasThead from "./CtpTrozasIngresadasThead";
import CtpTrozasIngresadasFila, { LeyendaOrigenDato } from "./CtpTrozasIngresadasFila";

type Multi = {
  value: readonly string[];
  options: FacetaOpcion[];
  onChange: (v: string[]) => void;
  /** Cómo se lee un valor (los tramos de días tienen clave y rótulo distintos). */
  etiqueta?: (v: string) => string;
};
/**
 * El pt de madera ROLLIZA es un derivado al 56 % (`pieTablarAserrableDe`), el
 * mismo de «Por permiso» y de las cifras. El pie decía `m³ × 424` —la
 * conversión de madera YA aserrada— y la misma pila salía con dos «pt»: 21 426
 * arriba y 38 260 abajo (medido en `main`, 2026-09-24).
 */
const ptAserrable = (m3: number) => pieTablarAserrableDe(m3, RENDIMIENTO_META);

type RangoCol = { valor: Rango<number>; onChange: (r: Rango<number>) => void; conDato: number };

/**
 * Los autofiltros de la cabecera. Escriben el MISMO estado que `useFiltroPatio`
 * — la vista los arma. Sin esto la tabla queda como siempre.
 */
export interface FiltrosPatioColumna {
  guia?: Multi;
  permiso?: Multi;
  especie?: Multi;
  /** Tramos de días en el patio (0-14 / 15-29 / 30-59 / 60+). */
  tramos?: Multi;
  largo?: RangoCol;
  diametro?: RangoCol;
}

export default function CtpTrozasIngresadas({
  filas,
  libres,
  totalPatio,
  filtrando,
  cargando,
  seleccion,
  onSeleccion,
  /** Sin lote elegido la tabla se mira pero no se elige. */
  seleccionable,
  acotadaA,
  titulo,
  vacio,
  loteId,
  onSacarDelLote,
  agrupar = "ninguna",
  menuAgrupar,
  accion,
  barra,
  ayuda,
  filtrosColumna,
  ahora,
}: {
  /** Las piezas a dibujar — ya filtradas por la vista. */
  filas: TrozaConsumible[];
  /** De `filas`, las que se pueden tildar. */
  libres: TrozaConsumible[];
  /** Cuántas tiene el patio sin filtrar: para decir qué quedó afuera. */
  totalPatio: number;
  filtrando: boolean;
  cargando?: boolean;
  seleccion: Set<string>;
  onSeleccion: (ids: Set<string>) => void;
  seleccionable: boolean;
  /** El lote que se está cargando: sus piezas apartadas se ven y se eligen. */
  loteId?: string;
  /** Devolver una pieza del lote al patio (apartar no es consumir). */
  onSacarDelLote?: (trozaId: string) => void;
  /** Qué acotó la lista desde afuera (la especie del lote). Se DICE (ADR-342). */
  acotadaA?: string;
  titulo?: string;
  vacio?: string;
  /** Subtotal arriba, detalle plegado. `"ninguna"` deja la tabla plana. */
  agrupar?: AgrupacionPatio;
  /** El botón «Opciones» de la vista: esto sólo le hace lugar en el header. */
  menuAgrupar?: React.ReactNode;
  /**
   * La acción de la tabla —«Consumir en un lote…» y el día—, a la derecha del
   * título (2026-09-24): antes vivía en una banda suelta arriba de la tarjeta y
   * la pista de cómo usarla, en un renglón huérfano debajo de la paginación.
   */
  accion?: React.ReactNode;
  /** La búsqueda y los filtros, DENTRO de la tarjeta que filtran (ley de Brandon, regla 5). */
  barra?: React.ReactNode;
  /** Cómo se usa esta tabla: va en el ⓘ del título, no como renglón (2026-09-24). */
  ayuda?: React.ReactNode;
  filtrosColumna?: FiltrosPatioColumna;
  /** La fecha con la que se cuentan los días (la misma que la de los KPI). */
  ahora?: Date;
}) {
  const fc = filtrosColumna ?? {};
  const idTitulo = useId();
  const hoy = useMemo(() => ahora ?? new Date(), [ahora]);
  const columnas = seleccionable ? 10 : 9;
  /* `px-2!`: el `DataTable` del DS fuerza `px-3` con un selector descendiente;
     con 9 columnas sacaba la última fuera de la caja a 1280 px (medido). */
  const totalVisible = filas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
  const elegidas = filas.filter((t) => seleccion.has(t.id));
  const delLoteElegidas = loteId == null ? 0 : elegidas.filter((t) => t.loteAserrioId === loteId).length;
  const volumenElegido = elegidas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
  const todasElegidas = libres.length > 0 && libres.every((t) => seleccion.has(t.id));
  /* Se pagina sobre lo YA filtrado (ADR-344). Agrupado no pagina. */
  /* En el celular cada troza es una tarjeta: arranca con 10 (medido 2026-09-24:
     25 tarjetas = 7 000 px). El selector sigue ofreciendo 25, 50, 100 y todas. */
  const [porPaginaInicial] = useState(() => (esPantallaAngosta() ? FILAS_POR_PAGINA_MOVIL : undefined));
  const { visibles: enPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(filas, { porPaginaInicial });
  const grupos = useMemo(() => agruparTrozas(filas, agrupar), [filas, agrupar]);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const alternar = (id: string) => {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSeleccion(next);
  };
  const fila = (t: TrozaConsumible) => (
    <CtpTrozasIngresadasFila
      key={t.id}
      t={t}
      ahora={hoy}
      seleccionable={seleccionable}
      elegida={seleccion.has(t.id)}
      onAlternar={alternar}
      loteId={loteId}
      onSacarDelLote={onSacarDelLote}
    />
  );

  return (
    <section aria-labelledby={idTitulo} className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CardTitle as="h3" id={idTitulo} className="flex flex-wrap items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <PackageOpen className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
              {titulo ?? "Trozas en el patio"}
            </CardTitle>
            {/* Cómo se usa y qué dicen los íconos de la guía: en el ⓘ, no en
                dos renglones sobre la tabla (Brandon 2026-09-24). */}
            <InfoTip
              title={titulo ?? "Trozas en el patio"}
              ancho="w-80"
              what={ayuda ?? "Lo que las guías recepcionadas dejaron en el patio y todavía no entró a la sierra."}
              body={<LeyendaOrigenDato />}
              example="Filtra por guía, permiso, especie o días desde el encabezado de cada columna, como en Excel."
            />
            {acotadaA && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-bold text-[var(--text-primary)]">solo {acotadaA}</span>
            )}
          </div>
        </div>
        {(accion || menuAgrupar) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {accion}
            {menuAgrupar}
          </div>
        )}
        {/* Lo que cambia mientras se elige, que es lo que se mira. */}
        {elegidas.length > 0 && (
          <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]" aria-live="polite">
            {elegidas.length} elegida{elegidas.length === 1 ? "" : "s"} · {fmtM3(volumenElegido)} m³ ·{" "}
            ≈{formatNumber(ptAserrable(volumenElegido))} pt aserr.
            {delLoteElegidas > 0 && (
              <span className="ml-2 font-normal text-[var(--text-secondary)]">
                ({delLoteElegidas} ya apartada{delLoteElegidas === 1 ? "" : "s"} en el lote)
              </span>
            )}
          </span>
        )}
      </header>

      {barra}
      {/* Qué se está mirando y qué quedó afuera (ADR-343). */}
      {filtrando && (
        <p className="text-sm text-[var(--text-secondary)]">
          Mostrando <b className="text-[var(--text-primary)]">{filas.length}</b> de {totalPatio} piezas
          {seleccionable && libres.length > 0 && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => onSeleccion(new Set([...seleccion, ...libres.map((t) => t.id)]))}
                className="inline-flex min-h-6 items-center font-bold text-[var(--text-primary)] underline underline-offset-2"
              >
                elegir las {libres.length} de este filtro
              </button>
            </>
          )}
        </p>
      )}

      <TablaCtp>
        <caption className="sr-only">{titulo ?? "Trozas en el patio"}</caption>
        <CtpTrozasIngresadasThead
          fc={fc}
          seleccionable={seleccionable}
          todasElegidas={todasElegidas}
          libres={libres}
          seleccion={seleccion}
          onSeleccion={onSeleccion}
        />
        <TbodyCtp>
          {filas.length === 0 && (
            <FilaVacia cols={columnas}>
              {cargando
                ? "Leyendo el patio…"
                : totalPatio === 0
                  ? (vacio ?? "No hay trozas de guías recepcionadas. Recepciona una guía en Ingresos y sus piezas aparecen acá.")
                  : "Ninguna troza coincide con el filtro."}
            </FilaVacia>
          )}
          {agrupar === "ninguna"
            ? enPagina.map(fila)
            : grupos.map((g) => {
                const abierto = abiertos.has(g.clave);
                return (
                  <Fragment key={g.clave}>
                    <tr className="bg-[var(--surface-sunken)]">
                      <td colSpan={columnas} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAbiertos((prev) => {
                              const s2 = new Set(prev);
                              if (s2.has(g.clave)) s2.delete(g.clave);
                              else s2.add(g.clave);
                              return s2;
                            })
                          }
                          aria-expanded={abierto}
                          className="flex min-h-6 w-full items-center gap-2 text-left text-sm font-bold text-[var(--text-primary)]"
                        >
                          <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-90" : ""}`} aria-hidden />
                          {g.clave}
                          <span className="font-normal text-[var(--text-secondary)]">{g.piezas} pza</span>
                          <span className="ml-auto tabular-nums text-[var(--text-primary)]">{fmtM3(g.volumenM3)} m³</span>
                        </button>
                      </td>
                    </tr>
                    {abierto && g.trozas.map(fila)}
                  </Fragment>
                );
              })}
        </TbodyCtp>
      </TablaCtp>

      {agrupar === "ninguna" ? (
        <CtpPaginacion
          rango={rango}
          porPagina={porPagina}
          onPorPagina={setPorPagina}
          onIr={ir}
          sustantivo="troza"
          extra={
            <span className="tabular-nums" title="Pie tablar que rendiría esta madera rolliza al 56 % (derivado, como en «Por permiso»)">
              {fmtM3(totalVisible)} m³ · ≈{formatNumber(ptAserrable(totalVisible))} pt aserr.
            </span>
          }
        />
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="tabular-nums text-[var(--text-primary)]">{grupos.length} grupo(s)</span> ·{" "}
          {filas.length} troza{filas.length === 1 ? "" : "s"} · {fmtM3(totalVisible)} m³
        </p>
      )}
    </section>
  );
}
