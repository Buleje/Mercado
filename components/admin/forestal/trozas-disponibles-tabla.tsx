"use client";

/**
 * «Por troza» de Trozas disponibles: una fila por pieza viva, con los filtros
 * en su cabecera (tipo Excel, OR adentro y AND entre columnas), buscador y
 * paginación. Los filtros son los MISMOS de toda la página: la cabecera y los
 * clics en las otras tablas escriben el mismo estado.
 *
 * Orden por defecto: las más viejas primero — son las que conviene aserrar antes.
 * En el celular la cabecera se oculta: los mismos filtros van en
 * `FiltrosMovilTrozas`. El pie dice cuántas están en el patio y cuántas
 * esperan su guía (la columna «Estado» lo dice fila por fila).
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "@buleje/design-system/icons";
import {
  FiltroColumnaMulti,
  FiltroColumnaRango,
  type Rango,
} from "@/components/admin/shared/filtros-columna";
import { formatNumber } from "@/lib/format";
import { ETIQUETA_TRAMO_DIAS, type TramoDias } from "@/lib/forestal/patio-resumen";
import {
  ETIQUETA_ESTADO_DISPONIBLE,
  type EstadoDisponible,
} from "@/lib/forestal/trozas-disponibles";
import {
  FILAS_POR_PAGINA_DEFAULT,
  FILAS_POR_PAGINA_MOVIL,
  esPantallaAngosta,
} from "@/lib/forestal/tabla-paginacion";
import {
  CtpPaginacion,
  FilaVacia,
  TablaCtp,
  TbodyCtp,
  TheadCtp,
  ThOrdenable,
  usePaginacion,
} from "./ctp-tabla";
import {
  FilaTrozaDisponible,
  ordenarTrozas,
  type CampoOrdenTroza,
} from "./trozas-disponibles-fila";
import {
  FiltrosMovilTrozas,
  aRango,
  deRango,
  opcionesDeTramos,
} from "./trozas-disponibles-filtros-movil";
import type { EstadoTrozasDisponibles } from "./hooks/use-trozas-disponibles";

const TH = "px-2! py-2 font-bold";
const nf = (n: number) => formatNumber(n);

function OrdenBoton({
  activo,
  dir,
  onClick,
  children,
}: {
  activo: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const Icono = !activo ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 font-bold uppercase tracking-[var(--ls-wider)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] ${
        activo ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""
      }`}
    >
      {children}
      <Icono className={`h-3.5 w-3.5 ${activo ? "" : "opacity-40"}`} aria-hidden />
    </button>
  );
}

export function TablaTrozasDisponibles({ e }: { e: EstadoTrozasDisponibles }) {
  const { filtro, poner, facetas, filtradas, ahora } = e;
  const [orden, setOrden] = useState<{ by: CampoOrdenTroza; dir: "asc" | "desc" }>({
    by: "dias",
    dir: "desc",
  });
  const onOrdenar = (c: CampoOrdenTroza) =>
    setOrden((o) =>
      o.by === c
        ? { by: c, dir: o.dir === "asc" ? "desc" : "asc" }
        : { by: c, dir: c === "codigo" ? "asc" : "desc" },
    );
  const filas = useMemo(
    () => ordenarTrozas(filtradas, orden.by, orden.dir, ahora),
    [filtradas, orden, ahora],
  );
  const [porPaginaInicial] = useState(() =>
    esPantallaAngosta() ? FILAS_POR_PAGINA_MOVIL : FILAS_POR_PAGINA_DEFAULT,
  );
  const { visibles, rango, porPagina, setPorPagina, ir } = usePaginacion(filas, {
    porPaginaInicial,
  });

  const tramos = opcionesDeTramos(facetas.tramos);
  const { enPatio, sinRecepcionar } = e.resumen;
  const ariaSortDias =
    orden.by === "dias" ? (orden.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <div className="space-y-2">
      <label className="relative block sm:max-w-[28rem]">
        <span className="sr-only">Buscar una troza</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <input
          type="search"
          value={filtro.texto}
          onChange={(ev) => {
            poner("texto", ev.target.value);
            ir(0);
          }}
          placeholder="Código, guía, permiso o especie"
          className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-9 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        {filtro.texto && (
          <button
            type="button"
            onClick={() => poner("texto", "")}
            aria-label="Borrar la búsqueda"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </label>
      <FiltrosMovilTrozas e={e} />

      <TablaCtp>
        <caption className="sr-only">Trozas disponibles, una por fila</caption>
        <TheadCtp>
          <tr>
            <ThOrdenable campo="codigo" orden={orden} onOrdenar={onOrdenar} className="px-2!">
              Código
            </ThOrdenable>
            <th scope="col" data-label="Guía" className={TH}>
              <span className="block">Guía</span>
              <FiltroColumnaMulti
                label="Guía"
                value={filtro.guia}
                options={facetas.guias}
                onChange={(v) => poner("guia", v)}
                placeholder="Todas"
              />
            </th>
            <th scope="col" data-label="Permiso" className={TH}>
              <span className="block">Permiso</span>
              <FiltroColumnaMulti
                label="Permiso"
                value={filtro.permiso}
                options={facetas.permisos}
                onChange={(v) => poner("permiso", v)}
                placeholder="Todos"
              />
            </th>
            <th scope="col" data-label="Especie" className={TH}>
              <span className="block">Especie</span>
              <FiltroColumnaMulti
                label="Especie"
                value={filtro.especie}
                options={facetas.especies}
                onChange={(v) => poner("especie", v)}
                placeholder="Todas"
              />
            </th>
            <th scope="col" data-label="Ø cm · largo m" className={TH}>
              <span className="block">Ø cm · largo m</span>
              {facetas.largo.conDato > 0 && (
                <FiltroColumnaRango
                  label="Largo"
                  unidad="m"
                  valor={aRango(filtro.largo)}
                  placeholder="Largo"
                  onChange={(r) => poner("largo", deRango(r as Rango<number>))}
                />
              )}
              {facetas.diametro.conDato > 0 && (
                <FiltroColumnaRango
                  label="Diámetro"
                  unidad="cm"
                  paso={1}
                  valor={aRango(filtro.diametro)}
                  placeholder="Ø"
                  onChange={(r) => poner("diametro", deRango(r as Rango<number>))}
                />
              )}
            </th>
            <ThOrdenable
              campo="m3"
              orden={orden}
              onOrdenar={onOrdenar}
              align="right"
              className="px-2!"
            >
              m³
            </ThOrdenable>
            <th scope="col" data-label="≈pt" className={`relative ${TH} text-right`}>
              ≈pt<span className="sr-only"> aserrable, derivado al 56 %</span>
            </th>
            <th scope="col" data-label="Estado" className={TH}>
              <span className="block">Estado</span>
              <FiltroColumnaMulti
                label="Estado"
                value={filtro.estado}
                options={facetas.estados}
                etiqueta={(v) => ETIQUETA_ESTADO_DISPONIBLE[v as EstadoDisponible] ?? v}
                onChange={(v) => poner("estado", v as EstadoDisponible[])}
                placeholder="Todos"
              />
            </th>
            <th scope="col" data-label="Días en el patio" aria-sort={ariaSortDias} className={TH}>
              <OrdenBoton
                activo={orden.by === "dias"}
                dir={orden.dir}
                onClick={() => onOrdenar("dias")}
              >
                Días
              </OrdenBoton>
              <FiltroColumnaMulti
                label="Días en el patio"
                value={filtro.tramos}
                options={tramos}
                etiqueta={(v) => ETIQUETA_TRAMO_DIAS[v as TramoDias] ?? v}
                onChange={(v) => poner("tramos", v as TramoDias[])}
                placeholder="Todos"
              />
            </th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {e.cargando && e.vivas.length === 0 && <FilaVacia cols={9}>Leyendo el patio…</FilaVacia>}
          {!e.cargando && filas.length === 0 && (
            <FilaVacia cols={9}>
              {e.vivas.length === 0
                ? "No hay trozas vivas en el patio."
                : "Ninguna troza con estos filtros."}
            </FilaVacia>
          )}
          {visibles.map((t) => (
            <FilaTrozaDisponible key={t.id} t={t} ahora={ahora} />
          ))}
        </TbodyCtp>
      </TablaCtp>
      {filas.length > 0 && (
        <CtpPaginacion
          rango={rango}
          porPagina={porPagina}
          onPorPagina={setPorPagina}
          onIr={ir}
          sustantivo="troza"
          extra={
            sinRecepcionar.trozas > 0
              ? `${nf(enPatio.trozas)} en el patio · ${nf(sinRecepcionar.trozas)} sin recepcionar`
              : undefined
          }
        />
      )}
    </div>
  );
}
