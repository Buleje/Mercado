"use client";

/**
 * Los filtros de «Paquete por paquete» para el celular (< 640 px).
 *
 * En el celular la tabla se vuelve tarjetas y su cabecera se oculta — con ella
 * los autofiltros de especie, producto, permiso y días. Acá están los MISMOS
 * controles, detrás de un botón «Filtros»; en pantalla ancha no se dibujan.
 */

import { useId, useState } from "react";
import { SlidersHorizontal } from "@buleje/design-system/icons";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { ETIQUETA_TRAMO, type TramoEdad } from "@/lib/forestal/edad-del-patio";
import { ETIQUETA_ESTADO_PRODUCTO, type EstadoProducto } from "@/lib/forestal/productos-disponibles-resumen";
import { productLabel } from "./ctp-shared";
import type { EstadoProductosDisponibles } from "./hooks/use-productos-disponibles";

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-sm font-bold text-[var(--text-primary)]">{etiqueta}</span>
      {children}
    </div>
  );
}

export function FiltrosMovilProductos({ e }: { e: EstadoProductosDisponibles }) {
  const { filtro, poner, facetas } = e;
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const puestos = [filtro.especie, filtro.producto, filtro.permiso, filtro.tramos, filtro.estado].filter(
    (v) => v.length > 0,
  ).length;

  return (
    <div className="space-y-2 sm:hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={idPanel}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors ${
          puestos > 0 || abierto ? "border-[var(--accent)]" : "border-[var(--rule-base)] hover:border-[var(--accent)]"
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filtros
        {puestos > 0 && (
          <span className="rounded-full bg-primary/15 px-2 tabular-nums">
            {puestos}
            <span className="sr-only"> {puestos === 1 ? "filtro puesto" : "filtros puestos"}</span>
          </span>
        )}
      </button>
      {abierto && (
        <div
          id={idPanel}
          role="group"
          aria-label="Filtros de los productos"
          className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
        >
          <Campo etiqueta="Especie">
            <FiltroColumnaMulti label="Especie" value={filtro.especie} options={facetas.especies} onChange={(v) => poner("especie", v)} placeholder="Todas" />
          </Campo>
          <Campo etiqueta="Producto">
            <FiltroColumnaMulti
              label="Producto"
              value={filtro.producto}
              options={facetas.productos}
              etiqueta={productLabel}
              onChange={(v) => poner("producto", v)}
              placeholder="Todos"
            />
          </Campo>
          <Campo etiqueta="Permiso">
            <FiltroColumnaMulti label="Permiso" value={filtro.permiso} options={facetas.permisos} onChange={(v) => poner("permiso", v)} placeholder="Todos" />
          </Campo>
          <Campo etiqueta="Días parado">
            <FiltroColumnaMulti
              label="Días parado"
              value={filtro.tramos}
              options={facetas.tramos}
              etiqueta={(v) => ETIQUETA_TRAMO[v as TramoEdad] ?? v}
              onChange={(v) => poner("tramos", v as TramoEdad[])}
              placeholder="Todos"
            />
          </Campo>
          <Campo etiqueta="Estado">
            <FiltroColumnaMulti
              label="Estado"
              value={filtro.estado}
              options={facetas.estados}
              etiqueta={(v) => ETIQUETA_ESTADO_PRODUCTO[v as EstadoProducto] ?? v}
              onChange={(v) => poner("estado", v as EstadoProducto[])}
              placeholder="Disponibles"
            />
          </Campo>
        </div>
      )}
    </div>
  );
}
