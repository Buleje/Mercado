"use client";

/**
 * DemoTablaFiltrosColumna — la tabla de referencia del primitivo: 4 columnas
 * (texto, multi, rango, fecha), usada por el test de render Y por el story de
 * Storybook (una sola fuente, no dos copias que se desincronizan). NO es un
 * componente de producción — es el ejemplo mínimo de cómo se cablea
 * `useFiltrosDeColumna` con los cuatro controles hoy, a mano, dentro de un
 * `<th>` cualquiera (la integración que la Fase 2 le agrega a `<DataTable>`).
 */

import { useMemo, useState } from "react";
import {
  ChipsDeFiltros,
  FiltroColumna,
  FiltroColumnaMulti,
  FiltroColumnaRango,
  useFiltrosDeColumna,
  type ColumnaFiltro,
  type Rango,
} from "./index";
import { columnasOcultasConFiltro } from "@/lib/admin/filtros-columna";

export interface FilaDemo {
  id: string;
  nombre: string;
  categoria: string;
  cantidad: number | null;
  fecha: string | null;
}

/** 30 filas deterministas: 5 sin `cantidad`/`fecha` (una corrida sin declarar
 *  todavía, como pasa en el libro real), 3 categorías repetidas 10 veces cada
 *  una, fechas repartidas en mayo 2026. */
export function filasDemo(): FilaDemo[] {
  return Array.from({ length: 30 }, (_, i) => ({
    id: `f${i}`,
    nombre: `Fila ${String(i).padStart(2, "0")}`,
    categoria: ["Comercial", "Paquetería", "Reproceso"][i % 3],
    cantidad: i < 5 ? null : i * 3,
    fecha: i < 5 ? null : `2026-05-${String(1 + (i % 28)).padStart(2, "0")}`,
  }));
}

export function DemoTablaFiltrosColumna({ filas }: { filas: FilaDemo[] }) {
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const columnas: ColumnaFiltro<FilaDemo>[] = useMemo(
    () => [
      { id: "nombre", label: "Nombre", tipo: "texto", valor: (f) => f.nombre, visible: !ocultas.has("nombre") },
      {
        id: "categoria",
        label: "Categoría",
        tipo: "multi",
        valor: (f) => f.categoria,
        visible: !ocultas.has("categoria"),
      },
      {
        id: "cantidad",
        label: "Cantidad",
        tipo: "rango",
        numero: (f) => f.cantidad,
        unidad: "m³",
        visible: !ocultas.has("cantidad"),
      },
      { id: "fecha", label: "Fecha", tipo: "fecha", numero: (f) => f.fecha, visible: !ocultas.has("fecha") },
    ],
    [ocultas],
  );
  const { opciones, filtradas, facetas, setFaceta, limpiar, activos, chips, enCabecera } = useFiltrosDeColumna(
    filas,
    columnas,
  );
  const ocultasConFiltro = columnasOcultasConFiltro(columnas, facetas);

  const alternar = (id: string) =>
    setOcultas((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3 bg-[var(--surface-canvas)] p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => alternar("categoria")}
          className="h-9 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)]"
        >
          {ocultas.has("categoria") ? "Mostrar" : "Ocultar"} columna Categoría
        </button>
        <span className="text-sm text-[var(--text-tertiary)]">{activos} filtro(s) puesto(s)</span>
      </div>

      <ChipsDeFiltros chips={chips} onQuitar={(id) => setFaceta(id, undefined)} onLimpiarTodo={limpiar} />

      {ocultasConFiltro.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            Columnas ocultas con filtro puesto
          </span>
          {ocultasConFiltro.map((c) => (
            <FiltroColumnaMulti
              key={c.id}
              label={c.label}
              value={facetas[c.id] as string[] | undefined}
              options={opciones[c.id] ?? []}
              onChange={(v) => setFaceta(c.id, v)}
            />
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--rule-base)]">
        <table className="w-full text-sm text-[var(--text-primary)]">
          <thead className="bg-[var(--surface-sunken)] align-top">
            <tr>
              {columnas.map((c) => (
                <th key={c.id} className="px-3 py-2.5 text-left font-semibold text-[var(--text-secondary)]">
                  {c.label}
                  {enCabecera[c.id] && c.tipo === "texto" && (
                    <FiltroColumna
                      label={c.label}
                      value={(facetas[c.id] as string[] | undefined)?.[0]}
                      options={opciones[c.id] ?? []}
                      onChange={(v) => setFaceta(c.id, v ? [v] : undefined)}
                    />
                  )}
                  {enCabecera[c.id] && c.tipo === "multi" && (
                    <FiltroColumnaMulti
                      label={c.label}
                      value={facetas[c.id] as string[] | undefined}
                      options={opciones[c.id] ?? []}
                      onChange={(v) => setFaceta(c.id, v)}
                    />
                  )}
                  {enCabecera[c.id] && c.tipo === "rango" && (
                    <FiltroColumnaRango
                      label={c.label}
                      unidad={c.unidad}
                      valor={facetas[c.id] as Rango<number> | undefined}
                      onChange={(r) => setFaceta(c.id, r)}
                    />
                  )}
                  {enCabecera[c.id] && c.tipo === "fecha" && (
                    <FiltroColumnaRango
                      label={c.label}
                      esFecha
                      valor={facetas[c.id] as Rango<string> | undefined}
                      onChange={(r) => setFaceta(c.id, r)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => (
              <tr key={f.id} className="border-t border-[var(--rule-soft)]">
                <td className="px-3 py-2">{f.nombre}</td>
                <td className="px-3 py-2">{f.categoria}</td>
                <td className="px-3 py-2 tabular-nums">{f.cantidad ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{f.fecha ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p data-testid="conteo" className="text-sm text-[var(--text-tertiary)]">
        {filtradas.length} de {filas.length}
      </p>
    </div>
  );
}
