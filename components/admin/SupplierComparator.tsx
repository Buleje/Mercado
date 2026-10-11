"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, ErrorAlert, LoadingState } from "@buleje/design-system";
import { RefreshCw, Search, ShoppingCart, Star, Users } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import ComparadorDetalle from "./proveedores/ComparadorDetalle";
import { ScoreBadge } from "./proveedores/ComparadorPiezas";
import {
  cargarProveedoresConPuntaje, diasDeEntrega, indicadoresDelComparador, ordenarProveedores,
  type OrdenComparador, type SupplierWithScore,
} from "./proveedores/comparador-datos";

const ORDENES: { id: OrdenComparador; label: string }[] = [
  { id: "score", label: "Puntaje" },
  { id: "name", label: "Nombre" },
  { id: "precio", label: "Precio" },
];

interface SupplierComparatorProps {
  /** Lleva al flujo de "Nueva orden" con el proveedor preseleccionado. */
  onCreateOC?: (supplier: { id: string; name: string }) => void;
  /** Avisa qué proveedor está elegido (Comparar muestra cómo entrega ese proveedor). */
  onSeleccion?: (supplier: { id: string; name: string } | null) => void;
}

/**
 * Compras › Proveedores › Comparar: tus proveedores lado a lado por puntaje
 * (calidad, precio, tiempo y condiciones) y, al elegir uno, su radar y «Crear
 * orden». El título y las secciones los pone la fila de `ProveedoresVista`.
 */
export default function SupplierComparator({ onCreateOC, onSeleccion }: SupplierComparatorProps = {}) {
  const [suppliers, setSuppliers] = useState<SupplierWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<OrdenComparador>("score");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const scored = await cargarProveedoresConPuntaje();
      setSuppliers(scored);
      setSelectedId((actual) => actual ?? scored[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar proveedores");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void fetchData(); }, [fetchData]);

  const sorted = useMemo(() => ordenarProveedores(suppliers, orden, texto), [suppliers, orden, texto]);
  const selectedSupplier = useMemo(() => suppliers.find((s) => s.id === selectedId) ?? null, [suppliers, selectedId]);

  /* Por id y nombre, no por el objeto: `suppliers` se recalcula al actualizar y
     un objeto nuevo con el mismo proveedor no tiene que remontar a quien escucha. */
  const elegidoId = selectedSupplier?.id ?? null;
  const elegidoNombre = selectedSupplier?.name ?? null;
  useEffect(() => {
    onSeleccion?.(elegidoId && elegidoNombre ? { id: elegidoId, name: elegidoNombre } : null);
  }, [onSeleccion, elegidoId, elegidoNombre]);

  // Una OC necesita productos: no se crea vacía por API (el POST viejo daba 404 mudo); se lleva a «Nueva orden» con el proveedor puesto.
  const crearOC = useCallback((s: SupplierWithScore) => onCreateOC?.({ id: s.id, name: s.name }), [onCreateOC]);

  const k = useMemo(() => indicadoresDelComparador(suppliers), [suppliers]);
  const kpis = useKpisPlegables({
    claveMemoria: "compras:proveedores:comparar",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: loading,
    resumen: k.evaluados > 0 ? `Top ${k.topName}` : "Sin evaluar",
    tarjetas: suppliers.length === 0 ? [] : [
      <Tarjeta key="top" rotulo="Mejor puntuado" valor={k.topName} detalle={k.topName === "—" ? "Sin proveedores evaluados aún" : `${k.topScore} de 100 puntos`} ayuda="El proveedor con mejor puntaje entre los que tienen evaluaciones reales." />,
      <Tarjeta key="prom" rotulo="Puntaje promedio" valor={String(k.avgScore)} detalle={`${k.evaluados} de ${k.total} evaluados`} ayuda="Promedio de los proveedores que ya tienen evaluaciones; los demás no cuentan." tono={k.avgScore >= 70 ? "ok" : k.avgScore >= 50 ? "aviso" : k.evaluados > 0 ? "malo" : undefined} />,
      <Tarjeta key="precio" rotulo="Mejor precio" valor={k.lowestPrice != null ? formatCurrency(Number(k.lowestPrice)) : "—"} detalle={k.lowestPriceName} ayuda="El proveedor con el precio promedio de compra más bajo." />,
    ],
  });

  if (loading && suppliers.length === 0) return <LoadingState message="Cargando proveedores..." />;
  if (error) {
    return (
      <ErrorAlert
        title="No se pudo armar el comparador"
        description={error}
        action={<button type="button" onClick={() => void fetchData()} className={button({ variant: "secondary" })}>Reintentar</button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] flex-1">
          <span className="sr-only">Buscar proveedor</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar proveedor"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
          />
        </label>
        <div role="group" aria-label="Ordenar por" className="inline-flex gap-2">
          {ORDENES.map((o) => (
            <button
              key={o.id} type="button" aria-pressed={orden === o.id} onClick={() => setOrden(o.id)}
              className={cn("h-12 rounded-xl border px-3 text-sm font-semibold transition-colors", orden === o.id ? "border-primary bg-primary text-white" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}
            >
              {o.label}
            </button>
          ))}
        </div>
        {kpis.boton}
        <button type="button" onClick={() => void fetchData()} title="Actualizar" aria-label="Actualizar" className={button({ variant: "secondary", className: "w-12 shrink-0 rounded-xl px-0" })}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
        </button>
      </div>

      {kpis.panel}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {sorted.length === 0 ? (
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-12 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
              <p className="text-sm text-[var(--text-secondary)]">{texto.trim() ? "Ningún proveedor coincide." : "Sin proveedores registrados"}</p>
            </div>
          ) : (
            <DataTable className="min-w-[640px]">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th className="hidden text-center sm:table-cell">Prods.</th>
                  <th className="hidden text-right md:table-cell">Precio prom.</th>
                  <th className="hidden text-center sm:table-cell">Entrega</th>
                  <th className="hidden lg:table-cell">Pago</th>
                  <th className="text-center">Puntaje</th>
                  <th className="text-center"><span className="sr-only">Orden de compra</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {sorted.map((s, idx) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(s.id); } }}
                    aria-label={`Ver detalle del proveedor ${s.name}`}
                    aria-selected={selectedId === s.id}
                    className={cn("cursor-pointer transition-colors", selectedId === s.id ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-[var(--surface-sunken)]")}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        {idx === 0 && s.hasData && orden === "score" && <Star className="h-4 w-4 shrink-0 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" aria-label="Mejor puntuado" />}
                        <div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">{s.name}</p>
                          {s.categoria && <p className="text-sm text-[var(--text-secondary)]">{s.categoria}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="hidden text-center text-sm text-[var(--text-secondary)] sm:table-cell">{s.productCount ?? "—"}</td>
                    <td className="hidden text-right font-mono text-sm text-[var(--text-secondary)] md:table-cell">{s.averagePurchasePrice ? formatCurrency(s.averagePurchasePrice) : "—"}</td>
                    <td className="hidden text-center text-sm text-[var(--text-secondary)] sm:table-cell">{diasDeEntrega(s) != null ? `${diasDeEntrega(s)} d` : "—"}</td>
                    <td className="hidden text-sm text-[var(--text-secondary)] lg:table-cell">{s.condicionPago ?? "—"}{s.diasCredito ? ` (${s.diasCredito}d)` : ""}</td>
                    <td className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ScoreBadge score={s.score} hasData={s.hasData} />
                        <span className="text-sm font-bold text-[var(--text-secondary)]">{s.hasData ? `${Number(s.score).toFixed(0)} pts` : "Sin datos"}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <button type="button" onClick={(e) => { e.stopPropagation(); crearOC(s); }} title="Crear orden de compra" className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-3" })}>
                        <ShoppingCart className="h-4 w-4" aria-hidden /> Orden
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
        {selectedSupplier && <ComparadorDetalle proveedor={selectedSupplier} onCrearOC={crearOC} />}
      </div>
    </div>
  );
}

function Tarjeta({ rotulo, valor, detalle, ayuda, tono }: { rotulo: string; valor: string; detalle: string; ayuda: string; tono?: "ok" | "aviso" | "malo" }) {
  const color = tono === "ok" ? "text-[var(--data-success-ink)]" : tono === "aviso" ? "text-[var(--data-warning-ink)]" : tono === "malo" ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]";
  return (
    <div className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        <InfoTip what={ayuda} />
      </div>
      <p className={cn("truncate text-lg font-extrabold tabular-nums", color)}>{valor}</p>
      <p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">{detalle}</p>
    </div>
  );
}
