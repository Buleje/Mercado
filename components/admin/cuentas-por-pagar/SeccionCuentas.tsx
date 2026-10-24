"use client";

import { useMemo } from "react";
import { Search } from "@buleje/design-system/icons";
import { coincideBusqueda } from "@/lib/compras/referencia-documento";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import TablaCuentas, { type Abierto } from "./TablaCuentas";
import { estaPagada, filtrar, ordenar, proveedoresConCuentas, type CuentaPorPagar, type FiltroEstado } from "./resumen-cuentas";
import type { PagoCuenta, ResultadoPago } from "./use-cuentas-por-pagar";

const ESTADOS: { id: FiltroEstado; label: string }[] = [
  { id: "pendientes", label: "Por pagar" },
  { id: "pagadas", label: "Pagadas" },
  { id: "todas", label: "Todas" },
];

const CAMPO = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export type FiltrosCuentas = { estado: FiltroEstado; proveedorId: string; q: string };

/**
 * La lista de cuentas con sus filtros pegados: estado, proveedor y el buscador
 * (C42), que encuentra el documento en cualquiera de sus variantes («F1-123»
 * encuentra «Factura F001-00000123») o el importe exacto.
 */
export default function SeccionCuentas({ cuentas, hoy, filtros, setFiltros, abierto, setAbierto, saving, onPagar, onEliminar, onAviso, onEstadoDeCuenta, onVincular }: {
  cuentas: CuentaPorPagar[];
  hoy: string;
  filtros: FiltrosCuentas;
  setFiltros: (cambio: Partial<FiltrosCuentas>) => void;
  abierto: Abierto;
  setAbierto: (a: Abierto) => void;
  saving: boolean;
  onPagar: (id: string, p: PagoCuenta) => Promise<ResultadoPago>;
  onEliminar: (id: string) => void;
  onAviso: (texto: string, tono: "ok" | "aviso") => void;
  onEstadoDeCuenta: (supplierId: string) => void;
  onVincular: (c: CuentaPorPagar) => void;
}) {
  const { estado, proveedorId, q } = filtros;
  const porProveedor = useMemo(() => proveedoresConCuentas(cuentas), [cuentas]);
  const buscadas = useMemo(() => cuentas.filter((c) => coincideBusqueda(c, q)), [cuentas, q]);
  const visibles = useMemo(() => ordenar(filtrar(buscadas, estado, proveedorId)), [buscadas, estado, proveedorId]);
  const conteo = useMemo(() => {
    const deProveedor = filtrar(buscadas, "todas", proveedorId);
    const pagadas = deProveedor.filter(estaPagada).length;
    return { pendientes: deProveedor.length - pagadas, pagadas, todas: deProveedor.length };
  }, [buscadas, proveedorId]);
  const elegido = porProveedor.find((p) => p.id === proveedorId);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Qué cuentas ver" className="inline-flex gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={estado === e.id}
              onClick={() => setFiltros({ estado: e.id })}
              className={cn(
                "h-12 rounded-xl border px-3 text-sm font-semibold transition-colors",
                estado === e.id ? "border-primary bg-primary text-white" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {e.label} <span className="tabular-nums opacity-80">{conteo[e.id]}</span>
            </button>
          ))}
        </div>
        <select
          value={proveedorId}
          onChange={(e) => setFiltros({ proveedorId: e.target.value })}
          aria-label="Filtrar por proveedor"
          className={cn(CAMPO, "max-w-full")}
        >
          <option value="">Todos los proveedores</option>
          {porProveedor.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}{p.debe > 0 ? ` · debes ${formatCurrency(p.debe)}` : " · al día"}</option>
          ))}
        </select>
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Buscar cuentas</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setFiltros({ q: e.target.value })}
            placeholder="Busca proveedor, documento o monto"
            className={cn(CAMPO, "w-full pl-9")}
          />
        </label>
      </div>
      {elegido && (
        <p className="text-sm text-[var(--text-secondary)]">
          Le debes <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(elegido.debe)}</strong> en {elegido.n} cuenta{elegido.n === 1 ? "" : "s"}.
        </p>
      )}
      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
          {q.trim() ? `Nada coincide con «${q.trim()}».` : estado === "pendientes" ? "No te falta pagar nada con este filtro." : "Sin cuentas con este filtro."}
        </p>
      ) : (
        <TablaCuentas
          cuentas={visibles}
          hoy={hoy}
          abierto={abierto}
          setAbierto={setAbierto}
          saving={saving}
          onPagar={onPagar}
          onEliminar={onEliminar}
          onAviso={onAviso}
          onEstadoDeCuenta={onEstadoDeCuenta}
          onVincular={onVincular}
        />
      )}
    </div>
  );
}
