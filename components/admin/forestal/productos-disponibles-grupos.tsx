"use client";

/**
 * Las tablas «Por permiso», «Por especie» y «Por producto» de Productos
 * disponibles: UNA tabla con la dimensión como parámetro (27-09).
 *
 * UN criterio: pt, m³, paquetes y piezas son lo DISPONIBLE (libre + apartado).
 * «Apartado» es cuánto de eso ya tiene dueño (está incluido, no se suma).
 * «Marcado usado» va en su columna, aparte, y sólo aparece si hay algo.
 *
 * Clic en el nombre = filtra toda la página (otro clic lo suelta). La flecha
 * abre la fila: las especies de un permiso o de un producto, los productos de
 * una especie. Ese detalle suma la fila (test del lib).
 */

import { Fragment, useId, useMemo, useState } from "react";
import { ChevronRight } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { fmtEdad } from "@/lib/forestal/edad-del-patio";
import {
  totalDeGrupos,
  type DimensionProducto,
  type FilaGrupo,
} from "@/lib/forestal/productos-disponibles-resumen";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp, ThOrdenable } from "./ctp-tabla";
import { productLabel } from "./ctp-shared";

const nf = (n: number) => formatNumber(n);
/** A 400 px cada fila es tarjeta: estas cifras la estiraban (patrón de «Por permiso» de Trozas). */
const SOLO_ANCHO = "max-sm:hidden!";
const CELDA = "px-3 py-2";
const NUM = `${CELDA} text-right tabular-nums`;

const TITULO: Record<DimensionProducto, string> = { permiso: "Permiso", especie: "Especie", producto: "Producto" };
const SUB: Record<DimensionProducto, DimensionProducto> = { permiso: "especie", especie: "producto", producto: "especie" };
const SUB_TITULO: Record<DimensionProducto, string> = { permiso: "Especies", especie: "Productos", producto: "Especies" };

/** Cómo se lee el nombre de un grupo: el producto con su mayúscula inicial. */
export const etiquetaDeGrupo = (dim: DimensionProducto, v: string) => (dim === "producto" ? productLabel(v) : v);

type Campo = "etiqueta" | "m3" | "paquetes" | "dias";

function ordenar(filas: readonly FilaGrupo[], by: Campo, dir: "asc" | "desc"): FilaGrupo[] {
  const s = dir === "asc" ? 1 : -1;
  const v = (g: FilaGrupo) =>
    by === "m3" ? g.disponible.m3 : by === "paquetes" ? g.disponible.paquetes : by === "dias" ? g.masViejoDias : null;
  return [...filas].sort((a, b) => {
    if (by === "etiqueta") return s * a.etiqueta.localeCompare(b.etiqueta, "es");
    const va = v(a);
    const vb = v(b);
    /* Sin dato al final en los dos sentidos: no es «el que menos tiene». */
    if (va == null) return vb == null ? 0 : 1;
    if (vb == null) return -1;
    return s * (va - vb);
  });
}

/** El detalle de una fila: lista (no tabla) — a 400 px una tabla anidada es tarjeta dentro de tarjeta. */
export function DetalleDeGrupo({
  filas,
  dim,
  onElegir,
}: {
  filas: readonly FilaGrupo[];
  dim: DimensionProducto;
  onElegir: (valor: string) => void;
}) {
  if (filas.length === 0) return <span className="text-sm text-[var(--text-secondary)]">Nada con estos filtros.</span>;
  const mayor = Math.max(0, ...filas.map((f) => f.disponible.m3));
  return (
    <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3" aria-label={SUB_TITULO[dim]}>
      {filas.map((f) => (
        <li key={f.clave || "sin"} className="min-w-0">
          <span className="flex items-baseline justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={() => onElegir(etiquetaDeGrupo(dim, f.etiqueta))}
              className="truncate font-bold text-[var(--text-primary)] underline-offset-2 hover:underline"
            >
              {etiquetaDeGrupo(dim, f.etiqueta)}
            </button>
            <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
              {f.disponible.filas > 0
                ? `${nf(f.disponible.pt)} pt · ${fmtM3(f.disponible.m3)} m³`
                : "0 disponible"}
            </span>
          </span>
          {mayor > 0 && (
            <span aria-hidden className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-canvas)]">
              <span
                className="block h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${f.disponible.m3 > 0 ? Math.max(2, (f.disponible.m3 / mayor) * 100) : 0}%` }}
              />
            </span>
          )}
          {f.usado.filas > 0 && (
            <span className="block text-sm tabular-nums text-[var(--text-secondary)]">
              Marcado usado: {fmtM3(f.usado.m3)} m³
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Cuántos grupos CON nombre (igual que la tarjeta y la pestaña); lo «Sin …» se nombra aparte. */
export const gruposConNombre = (filas: readonly FilaGrupo[]) => filas.filter((g) => g.clave !== "").length;

function rotuloTotal(dim: DimensionProducto, filas: readonly FilaGrupo[]) {
  const n = gruposConNombre(filas);
  const sin = filas.some((g) => g.clave === "");
  const nombre = TITULO[dim].toLowerCase();
  return `Total · ${nf(n)} ${nombre}${n === 1 ? "" : "s"}${sin ? ` + sin ${nombre}` : ""}`;
}

/** Qué dimensión se abre debajo de cada fila. */
export const subDimension = (dim: DimensionProducto) => SUB[dim];

export function TablaGruposProductos({
  dim,
  filas,
  esActivo,
  onElegir,
  onElegirDetalle,
  detalleDe,
  cargando,
}: {
  dim: DimensionProducto;
  filas: readonly FilaGrupo[];
  /** ¿Este grupo está filtrando la página? Su fila va `aria-pressed`. */
  esActivo: (g: FilaGrupo) => boolean;
  onElegir: (valor: string) => void;
  /** Clic en un subgrupo del detalle: filtra por ESA dimensión (la especie de un permiso…). */
  onElegirDetalle: (sub: DimensionProducto, valor: string) => void;
  /** Los subgrupos de una fila (suman la fila). */
  detalleDe: (g: FilaGrupo) => readonly FilaGrupo[];
  cargando: boolean;
}) {
  const idBase = useId();
  const [orden, setOrden] = useState<{ by: Campo; dir: "asc" | "desc" }>({ by: "m3", dir: "desc" });
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set());
  const onOrdenar = (c: Campo) =>
    setOrden((o) => (o.by === c ? { by: c, dir: o.dir === "asc" ? "desc" : "asc" } : { by: c, dir: c === "etiqueta" ? "asc" : "desc" }));
  const vista = useMemo(() => ordenar(filas, orden.by, orden.dir), [filas, orden]);
  const total = useMemo(() => totalDeGrupos(filas), [filas]);
  const hayApartado = total.apartado.m3 > 0;
  const hayUsado = total.usado.filas > 0;
  const cols = 7 + (hayApartado ? 1 : 0) + (hayUsado ? 1 : 0);
  const alternar = (k: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });

  return (
    <TablaCtp>
      <caption className="sr-only">Productos disponibles por {TITULO[dim].toLowerCase()}</caption>
      <TheadCtp>
        <tr>
          <ThOrdenable campo="etiqueta" orden={orden} onOrdenar={onOrdenar}>
            {TITULO[dim]}
          </ThOrdenable>
          <ThOrdenable campo="m3" orden={orden} onOrdenar={onOrdenar} align="right" className="relative">
            pt<span className="sr-only"> disponibles</span>
          </ThOrdenable>
          <th scope="col" className={`relative ${CELDA} text-right`}>
            m³<span className="sr-only"> disponibles</span>
          </th>
          <ThOrdenable campo="paquetes" orden={orden} onOrdenar={onOrdenar} align="right">
            Paquetes
          </ThOrdenable>
          <th scope="col" className={`${CELDA} ${SOLO_ANCHO} text-right`}>Piezas</th>
          <th scope="col" className={`${CELDA} ${SOLO_ANCHO} text-right`}>% del m³</th>
          {hayApartado && <th scope="col" className={`${CELDA} text-right`}>Apartado</th>}
          <ThOrdenable campo="dias" orden={orden} onOrdenar={onOrdenar}>
            Lo más viejo
          </ThOrdenable>
          {hayUsado && <th scope="col" className={CELDA}>Marcado usado</th>}
        </tr>
      </TheadCtp>
      <TbodyCtp>
        {cargando && filas.length === 0 && <FilaVacia cols={cols}>Leyendo la planta…</FilaVacia>}
        {!cargando && filas.length === 0 && <FilaVacia cols={cols}>Nada disponible con estos filtros.</FilaVacia>}
        {vista.map((g) => {
          const activo = esActivo(g);
          const k = g.clave || "sin";
          const abierto = abiertos.has(k);
          const idDet = `${idBase}-det-${k}`;
          const nombre = etiquetaDeGrupo(dim, g.etiqueta);
          return (
            <Fragment key={k}>
              <tr className={activo ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"}>
                <td className={CELDA}>
                  <div className="flex items-start gap-1">
                    <button
                      type="button"
                      onClick={() => alternar(k)}
                      aria-expanded={abierto}
                      aria-controls={abierto ? idDet : undefined}
                      aria-label={`${abierto ? "Ocultar" : "Ver"} ${SUB_TITULO[dim].toLowerCase()} de ${nombre}`}
                      className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${abierto ? "rotate-90" : ""}`} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onElegir(nombre)}
                      aria-pressed={activo}
                      aria-label={`Filtrar por ${nombre}: ${nf(g.disponible.pt)} pt, ${fmtM3(g.disponible.m3)} m³`}
                      className={`min-h-8 rounded-lg border-2 px-2 py-1 text-left font-bold text-[var(--text-primary)] transition-colors ${
                        activo ? "border-[var(--accent)]" : "border-transparent hover:border-[var(--accent)]"
                      }`}
                    >
                      {nombre}
                    </button>
                  </div>
                </td>
                <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{nf(g.disponible.pt)}</td>
                <td className={`${NUM} text-[var(--text-primary)]`}>{fmtM3(g.disponible.m3)}</td>
                <td className={`${NUM} text-[var(--text-primary)]`}>
                  {g.disponible.paquetes > 0 ? nf(g.disponible.paquetes) : "—"}
                  {g.disponible.filas > g.disponible.paquetes && (
                    <span className="block text-sm text-[var(--text-secondary)]">
                      {g.disponible.paquetes > 0 ? "+" : ""}
                      {nf(g.disponible.filas - g.disponible.paquetes)} sin paquete
                    </span>
                  )}
                </td>
                <td className={`${NUM} ${SOLO_ANCHO} text-[var(--text-secondary)]`}>{nf(g.disponible.piezas)}</td>
                <td className={`${NUM} ${SOLO_ANCHO} text-[var(--text-secondary)]`}>{g.pctM3} %</td>
                {hayApartado && (
                  <td className={`${NUM} text-[var(--text-secondary)]`}>{g.apartado.m3 > 0 ? `${fmtM3(g.apartado.m3)} m³` : "—"}</td>
                )}
                <td className={`${CELDA} text-[var(--text-secondary)]`}>{fmtEdad(g.masViejoDias)}</td>
                {hayUsado && (
                  <td className={`${CELDA} tabular-nums text-[var(--text-secondary)]`}>
                    {g.usado.filas > 0 ? `${fmtM3(g.usado.m3)} m³` : "—"}
                  </td>
                )}
              </tr>
              {abierto && (
                <tr id={idDet} className="bg-[var(--surface-sunken)]/60">
                  <td colSpan={cols} className="px-3 pb-3 pt-1">
                    <DetalleDeGrupo filas={detalleDe(g)} dim={SUB[dim]} onElegir={(v) => onElegirDetalle(SUB[dim], v)} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </TbodyCtp>
      {filas.length > 1 && (
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <tr>
            <th scope="row" className={`${CELDA} text-left font-bold text-[var(--text-primary)]`}>
              {rotuloTotal(dim, filas)}
            </th>
            <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{nf(total.disponible.pt)}</td>
            <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(total.disponible.m3)}</td>
            <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{nf(total.disponible.paquetes)}</td>
            <td className={`${NUM} ${SOLO_ANCHO} text-[var(--text-secondary)]`}>{nf(total.disponible.piezas)}</td>
            <td className={`${NUM} ${SOLO_ANCHO} text-[var(--text-secondary)]`}>100 %</td>
            {hayApartado && <td className={`${NUM} text-[var(--text-secondary)]`}>{fmtM3(total.apartado.m3)} m³</td>}
            <td className={`${CELDA} text-[var(--text-secondary)]`}>{fmtEdad(total.masViejoDias)}</td>
            {hayUsado && <td className={`${CELDA} tabular-nums text-[var(--text-secondary)]`}>{fmtM3(total.usado.m3)} m³</td>}
          </tr>
        </tfoot>
      )}
    </TablaCtp>
  );
}
