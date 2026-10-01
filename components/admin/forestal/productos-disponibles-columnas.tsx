"use client";

/**
 * Las columnas de «Paquete por paquete»: cuáles se pueden apagar, en qué orden
 * se arrastran (Brandon 2026-09-26), la cabecera con sus autofiltros tipo Excel
 * y el pie con los totales bajo su columna. La cabecera, las filas y el pie
 * pintan con el MISMO orden (`EnOrden`), o un m³ cae bajo el título de otra.
 */

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "@buleje/design-system/icons";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ETIQUETA_TRAMO, fmtEdad, type ResumenEdad, type TramoEdad } from "@/lib/forestal/edad-del-patio";
import type { CampoOrden, Orden } from "@/lib/forestal/disponibles-orden";
import { ptDe } from "@/lib/forestal/productos-disponibles-resumen";
import { productLabel } from "./ctp-shared";
import { ThOrdenable } from "./ctp-tabla";
import type { EstadoProductosDisponibles } from "./hooks/use-productos-disponibles";

/** Las opcionales. Código/Producto/Especie/Piezas/Volumen/Saldo quedan fijas. */
export const COLUMNAS_DISPONIBLES_OPCIONALES = [
  { key: "presentacion", label: "Presentación" },
  { key: "medidas", label: "Medidas" },
  { key: "lote", label: "Corrida / lote" },
  { key: "pieTablar", label: "Pie tablar" },
  /* Prendida: un paquete llevaba 331 días parado y la tabla no mostraba una fecha. */
  { key: "edad", label: "Parado hace" },
  /* Apagada: en Blas ninguna guía tiene costo cargado todavía. */
  { key: "valor", label: "Valor (S/)", porDefecto: false },
  { key: "permiso", label: "N° Permiso", porDefecto: false },
] as const;
export type ColumnaOpcional = (typeof COLUMNAS_DISPONIBLES_OPCIONALES)[number]["key"];
export type ColumnasVisibles = Record<ColumnaOpcional, boolean>;

/** Las que se arrastran: la casilla de elegir y «Acciones» quedan fijas. */
export const ORDEN_DISPONIBLES_DEFECTO = [
  "codigo", "producto", "especie", "presentacion", "medidas",
  "piezas", "volumen", "pieTablar", "valor", "lote", "edad", "saldo", "permiso",
] as const;

const TH = "px-2! py-2 font-bold";

/** Como `ThOrdenable`, con lugar para el autofiltro DEBAJO del botón que ordena. */
function ThConFiltro({
  campo,
  orden,
  onOrdenar,
  label,
  filtro,
  col,
  align = "left",
}: {
  campo: CampoOrden;
  orden: Orden;
  onOrdenar: (c: CampoOrden) => void;
  label: ReactNode;
  filtro?: ReactNode;
  col: string;
  align?: "left" | "right";
}) {
  const activo = orden.by === campo;
  const Icono = !activo ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      data-col={col}
      data-label={typeof label === "string" ? label : undefined}
      aria-sort={activo ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${TH} ${align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 font-bold uppercase tracking-[var(--ls-wider)] transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] ${
          activo ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""
        }`}
      >
        {label}
        <Icono className={`h-3.5 w-3.5 ${activo ? "" : "opacity-40"}`} aria-hidden="true" />
      </button>
      {filtro}
    </th>
  );
}

export function CabeceraPaquetes({
  e,
  orden,
  onOrdenar,
  cols,
  ordenCols,
}: {
  e: EstadoProductosDisponibles;
  orden: Orden;
  onOrdenar: (c: CampoOrden) => void;
  cols: ColumnasVisibles;
  ordenCols: readonly string[];
}) {
  const { filtro, poner, facetas } = e;
  const multi = (label: string, campo: "especie" | "producto" | "permiso", opciones: typeof facetas.especies, etiqueta?: (v: string) => string) =>
    (opciones.length > 0 || filtro[campo].length > 0) && (
      <FiltroColumnaMulti
        label={label}
        value={filtro[campo]}
        options={opciones}
        etiqueta={etiqueta}
        onChange={(v) => poner(campo, v)}
        placeholder="Todos"
      />
    );
  return (
    <EnOrden
      orden={ordenCols}
      celdas={{
        codigo: (
          <ThOrdenable className="px-2!" campo="codigo" orden={orden} onOrdenar={onOrdenar} col="codigo">
            Código paquete
          </ThOrdenable>
        ),
        producto: (
          <ThConFiltro campo="producto" orden={orden} onOrdenar={onOrdenar} label="Producto" col="producto"
            filtro={multi("Producto", "producto", facetas.productos, productLabel)} />
        ),
        especie: (
          <ThConFiltro campo="especie" orden={orden} onOrdenar={onOrdenar} label="Especie" col="especie"
            filtro={multi("Especie", "especie", facetas.especies)} />
        ),
        presentacion: cols.presentacion && <th data-col="presentacion" className={TH}>Presentación</th>,
        medidas: cols.medidas && <th data-col="medidas" className={TH}>Medidas</th>,
        piezas: (
          <ThOrdenable className="px-2!" campo="piezas" orden={orden} onOrdenar={onOrdenar} align="right" col="piezas">
            Piezas
          </ThOrdenable>
        ),
        volumen: (
          <ThOrdenable className="px-2!" campo="volumen" orden={orden} onOrdenar={onOrdenar} align="right" col="volumen">
            Volumen
          </ThOrdenable>
        ),
        pieTablar: cols.pieTablar && (
          <ThOrdenable className="px-2!" campo="pieTablar" orden={orden} onOrdenar={onOrdenar} align="right" col="pieTablar">
            Pie tablar
          </ThOrdenable>
        ),
        valor: cols.valor && (
          <ThOrdenable className="px-2!" campo="valor" orden={orden} onOrdenar={onOrdenar} align="right" col="valor">
            Valor (S/)
          </ThOrdenable>
        ),
        lote: cols.lote && <th data-col="lote" className={TH}>Corrida / lote</th>,
        edad: cols.edad && (
          <ThConFiltro campo="edad" orden={orden} onOrdenar={onOrdenar} label="Parado hace" col="edad" align="right"
            filtro={
              (facetas.tramos.length > 0 || filtro.tramos.length > 0) && (
                <FiltroColumnaMulti
                  label="Días parado"
                  value={filtro.tramos}
                  options={facetas.tramos}
                  etiqueta={(v) => ETIQUETA_TRAMO[v as TramoEdad] ?? v}
                  onChange={(v) => poner("tramos", v as TramoEdad[])}
                  placeholder="Todos"
                />
              )
            }
          />
        ),
        saldo: (
          <ThOrdenable className="px-2!" campo="saldo" orden={orden} onOrdenar={onOrdenar} align="right" col="saldo">
            Saldo corrida
          </ThOrdenable>
        ),
        permiso: cols.permiso && (
          <th data-col="permiso" data-label="N° Permiso" className={TH}>
            <span className="block">N° Permiso</span>
            {multi("Permiso", "permiso", facetas.permisos)}
          </th>
        ),
      }}
    />
  );
}

/**
 * Los totales, bajo su columna. «Saldo corrida» sin total a propósito: la misma
 * corrida repite su saldo en cada paquete y sumarla la contaría de más.
 */
export function PiePaquetes({
  cols,
  ordenCols,
  resumen,
  edad,
  valor,
}: {
  cols: ColumnasVisibles;
  ordenCols: readonly string[];
  resumen: { filas: number; corridas: number; piezas: number; m3: number };
  edad: ResumenEdad;
  valor: { totalSoles: number; filasValorizadas: number; filasSinValor: number };
}) {
  const NUM = "px-2! py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]";
  return (
    <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
      <tr>
        <td />
        <EnOrden
          orden={ordenCols}
          celdas={{
            codigo: (
              <td className="px-2! py-2 text-sm font-bold text-[var(--text-secondary)]">
                {resumen.corridas} {resumen.corridas === 1 ? "corrida" : "corridas"} · {resumen.filas}{" "}
                {resumen.filas === 1 ? "fila" : "filas"}
              </td>
            ),
            producto: <td />,
            especie: <td />,
            presentacion: cols.presentacion && <td />,
            medidas: cols.medidas && <td />,
            piezas: <td className={NUM}>{formatNumber(resumen.piezas)}</td>,
            volumen: <td className={NUM}>{fmtM3(resumen.m3)}</td>,
            pieTablar: cols.pieTablar && <td className={NUM}>{formatNumber(ptDe(resumen.m3))}</td>,
            valor: cols.valor && (
              <td className={NUM}>
                {/* Sin total si falta valorizar alguna fila: un subtotal presentado como total engaña. */}
                {valor.filasSinValor > 0 || valor.filasValorizadas === 0 ? (
                  <span
                    title={`Faltan ${valor.filasSinValor} filas por valorizar`}
                    className="font-sans text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]"
                  >
                    parcial
                  </span>
                ) : (
                  formatCurrency(valor.totalSoles)
                )}
              </td>
            ),
            lote: cols.lote && <td />,
            edad: cols.edad && (
              <td className="px-2! py-2 text-right font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                {edad.masViejoDias == null ? "—" : `el más viejo: ${fmtEdad(edad.masViejoDias)}`}
              </td>
            ),
            saldo: <td />,
            permiso: cols.permiso && <td />,
          }}
        />
        <td className="sm:sticky sm:right-0 sm:z-[1] bg-[var(--surface-sunken)]" />
      </tr>
    </tfoot>
  );
}
