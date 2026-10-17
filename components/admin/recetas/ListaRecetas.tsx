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
import { disponibilidadDe, margenDe, type ProductInfo, type Receta } from "./tipos";

type Estado = "todas" | "activas" | "inactivas";
type Orden = "nombre" | "costo-asc" | "costo-desc" | "recientes";

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

function ordenar(lista: Receta[], orden: Orden) {
  return [...lista].sort((a, b) => {
    switch (orden) {
      case "nombre": return a.nombre.localeCompare(b.nombre);
      case "costo-asc": return a.costoTotal - b.costoTotal;
      case "costo-desc": return b.costoTotal - a.costoTotal;
      case "recientes": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
}

export function ListaRecetas({ recetas, productos, loading, error, onReintentar, onDetalle, onProducir, onNueva }: Props) {
  const [texto, setTexto] = useState("");
  const [textoFiltro, setTextoFiltro] = useState("");
  const [estado, setEstado] = useState<Estado>("todas");
  const [orden, setOrden] = useState<Orden>("nombre");

  useEffect(() => {
    const t = setTimeout(() => setTextoFiltro(texto), 200);
    return () => clearTimeout(t);
  }, [texto]);

  const filas = useMemo(() => {
    const q = textoFiltro.trim().toLowerCase();
    return ordenar(
      recetas.filter((r) => {
        if (estado === "activas" && !r.activa) return false;
        if (estado === "inactivas" && r.activa) return false;
        return !q || r.nombre.toLowerCase().includes(q);
      }),
      orden,
    );
  }, [recetas, estado, textoFiltro, orden]);

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
        </div>
        <select aria-label="Ordenar recetas" value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={cn(CAJA, "shrink-0 px-3 font-semibold")}>
          <option value="nombre">Nombre A-Z</option>
          <option value="costo-asc">Costo menor</option>
          <option value="costo-desc">Costo mayor</option>
          <option value="recientes">Más recientes</option>
        </select>
      </div>

      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          No hay recetas {textoFiltro ? `con «${textoFiltro}»` : estado}.
        </p>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Receta</th>
              <th>Insumos de hoy</th>
              <th className="text-right">Costo</th>
              <th className="text-right">Margen</th>
              <th data-label="Acciones"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => {
              const margen = margenDe(r, productos);
              const { total, faltan } = disponibilidadDe(r, productos);
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
      )}
    </div>
  );
}
