"use client";

/**
 * La lista de recetas: buscador · estado · orden en UNA fila de 48 px, pegada a
 * la tabla. Cada fila: la receta (abre su detalle), si alcanzan los insumos de
 * hoy, costo, margen, «Producir» y un «⋯» con el resto. A 400 px la tabla se
 * vuelve tarjetas sola (`useMobileTableCards` del shell).
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChefHat, Eye, MoreHorizontal, Search } from "@buleje/design-system/icons";
import { DataTable, LoadingState } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import ActionMenu from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { disponibilidadDe, margenDe, type ProductInfo, type Receta } from "./tipos";

type Estado = "todas" | "activas" | "inactivas";

interface Props {
  recetas: readonly Receta[];
  productos: Record<number, ProductInfo>;
  loading: boolean;
  error: string | null;
  onReintentar: () => void;
  onDetalle: (r: Receta) => void;
  onProducir: (r: Receta) => void;
  onNueva: () => void;
}

const CAJA = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const CHIP = "inline-flex h-12 shrink-0 items-center rounded-xl border px-3 text-sm font-semibold transition-colors";
const CHIP_ON = "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

type Fila = { r: Receta; margen: number | null; total: number; faltan: number };

const INSUMOS = (f: Fila) => (f.total === 0 ? "Sin ingredientes" : f.faltan === 0 ? "Completos" : "Les falta algo");

const COLUMNAS: readonly ColumnaFiltro<Fila>[] = [
  { id: "receta", label: "Receta", tipo: "texto", valor: (f) => f.r.nombre },
  { id: "insumos", label: "Insumos de hoy", tipo: "multi", valor: (f) => INSUMOS(f), soloConVarios: true },
  { id: "costo", label: "Costo", tipo: "rango", numero: (f) => f.r.costoTotal, unidad: "S/", paso: 0.01 },
  { id: "margen", label: "Margen", tipo: "rango", numero: (f) => f.margen, unidad: "%", paso: 1 },
];

const ORDEN: Record<string, AccesorOrden<Fila>> = {
  receta: { valor: (f) => f.r.nombre, texto: true },
  insumos: { valor: (f) => f.faltan },
  costo: { valor: (f) => f.r.costoTotal },
  margen: { valor: (f) => f.margen },
};

export function ListaRecetas({ recetas, productos, loading, error, onReintentar, onDetalle, onProducir, onNueva }: Props) {
  const [texto, setTexto] = useState("");
  const [textoFiltro, setTextoFiltro] = useState("");
  const [estado, setEstado] = useState<Estado>("todas");

  useEffect(() => {
    const t = setTimeout(() => setTextoFiltro(texto), 200);
    return () => clearTimeout(t);
  }, [texto]);

  const base = useMemo<Fila[]>(() => {
    const q = textoFiltro.trim().toLowerCase();
    return recetas
      .filter((r) => {
        if (estado === "activas" && !r.activa) return false;
        if (estado === "inactivas" && r.activa) return false;
        return !q || r.nombre.toLowerCase().includes(q);
      })
      .map((r) => ({ r, margen: margenDe(r, productos), ...disponibilidadDe(r, productos) }));
  }, [recetas, productos, estado, textoFiltro]);
  const f = useFiltrosTabla(base, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const conFaltantes = useMemo(() => base.filter((x) => x.total > 0 && x.faltan > 0).length, [base]);
  const valorInsumos = f.facetas.insumos;
  const faltanActivo = Array.isArray(valorInsumos) && valorInsumos.length === 1 && valorInsumos[0] === "Les falta algo";
  const filas = useMemo(() => {
    const lista = ord.ordenar(f.filtradas);
    return ord.activa ? lista : [...lista].sort((a, b) => a.r.nombre.localeCompare(b.r.nombre));
  }, [ord, f.filtradas]);

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{error}</p>
        <button type="button" onClick={onReintentar} className={button({ variant: "secondary", className: "rounded-xl" })}>Reintentar</button>
      </div>
    );
  }
  if (recetas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-10 text-center">
        <ChefHat className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">Aún no tienes recetas.</p>
        <button type="button" onClick={onNueva} className={button({ variant: "secondary", className: "rounded-xl" })}>Crear primera receta</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <label className="relative min-w-0 grow basis-full sm:basis-60">
          <span className="sr-only">Buscar receta</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar receta…" className={cn(CAJA, "w-full pl-9 pr-3 placeholder:text-[var(--text-tertiary)]")} />
        </label>
        <div role="group" aria-label="Filtrar por estado" className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto scrollbar-none">
          {(["todas", "activas", "inactivas"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={estado === f} onClick={() => setEstado(f)} className={cn(CHIP, estado === f ? CHIP_ON : CHIP_OFF)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          {/* Atajo al filtro de la columna «Insumos de hoy» (el mismo estado, no otro). */}
          {conFaltantes > 0 && (
            <button type="button" aria-pressed={faltanActivo} onClick={() => f.setFaceta("insumos", faltanActivo ? undefined : ["Les falta algo"])} className={cn(CHIP, faltanActivo ? CHIP_ON : CHIP_OFF)}>
              Les faltan insumos hoy ({conFaltantes})
            </button>
          )}
        </div>
      </div>

      {base.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          No hay recetas {textoFiltro ? `con «${textoFiltro}»` : estado}.
        </p>
      ) : (
        <>
        <BarraFiltrosTabla f={f} />
        <DataTable>
          <thead>
            <tr>
              <ThColumna label="Receta" ids={["receta"]} f={f} orden={ord} ordenId="receta" />
              <ThColumna label="Insumos de hoy" ids={["insumos"]} f={f} orden={ord} ordenId="insumos" />
              <ThColumna label="Costo" ids={["costo"]} f={f} derecha orden={ord} ordenId="costo" />
              <ThColumna label="Margen" ids={["margen"]} f={f} derecha orden={ord} ordenId="margen" />
              <th data-label="Acciones"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
            {filas.map(({ r, margen, total, faltan }) => {
              return (
                <tr key={r.id} className={cn(!r.activa && "opacity-70")}>
                  <td>
                    <button type="button" onClick={() => onDetalle(r)} className="group flex min-h-12 max-w-full flex-col justify-center text-left">
                      <span className="truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-ink)] group-hover:underline dark:group-hover:text-[var(--accent)]">{r.nombre}</span>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {total} ingrediente{total === 1 ? "" : "s"}{!r.activa && " · Inactiva"}
                      </span>
                    </button>
                  </td>
                  <td className={cn("font-semibold", total === 0 ? "text-[var(--text-tertiary)]" : faltan === 0 ? "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]")}>
                    {total === 0 ? "—" : faltan === 0 ? "Completos" : `Faltan ${faltan} de ${total}`}
                  </td>
                  <td className="text-right font-bold tabular-nums">{formatCurrency(r.costoTotal)}</td>
                  <td className={cn("text-right font-bold tabular-nums", margen === null ? "text-[var(--text-tertiary)]" : margen >= 20 ? "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]")}>
                    {margen === null ? "—" : `${margen}%`}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => onProducir(r)} className={button({ variant: "primary", className: "rounded-xl" })}>Producir</button>
                      <ActionMenu
                        label="Más"
                        icon={MoreHorizontal}
                        soloIcono
                        size="md"
                        className="w-12 shrink-0"
                        title={`Más acciones de ${r.nombre}`}
                        actions={[{ id: "detalle", label: "Ver detalle y costos", icon: Eye, onSelect: () => onDetalle(r) }]}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        </>
      )}
    </div>
  );
}
