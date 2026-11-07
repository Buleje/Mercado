"use client";

/**
 * Por pedido: una tarjeta por pedido con su lista para marcar. Arriba, un
 * filtro por etapa (Sin empezar / Juntando / Listo / Listo con faltante) con
 * cuántos hay en cada una. El orden es el del servidor: el más viejo primero.
 */

import { useState } from "react";
import { ClipboardList } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { etapaDe, ROTULO_ETAPA, type EtapaPrep } from "@/lib/pedidos/preparacion";
import { usePermisosPedidos } from "@/components/admin/OrdersTab/permisos-pedidos";
import { TarjetaPreparacion } from "./TarjetaPreparacion";
import { Vacio } from "./piezas";
import type { Preparacion } from "./use-preparacion";

const ETAPAS: readonly EtapaPrep[] = ["sin-empezar", "en-curso", "listo-parcial", "listo"];

export function PorPedido({ prep, ahora }: { prep: Preparacion; ahora: number }) {
  const permisos = usePermisosPedidos();
  const [filtro, setFiltro] = useState<EtapaPrep | "todas">("todas");
  const cuenta = (e: EtapaPrep) => prep.pedidos.filter((p) => etapaDe(p) === e).length;
  const visibles = filtro === "todas" ? prep.pedidos : prep.pedidos.filter((p) => etapaDe(p) === filtro);
  const puedeAnotar = permisos.mover || permisos.guia;

  if (prep.pedidos.length === 0) {
    return <Vacio icono={ClipboardList} texto="No hay pedidos por preparar: los confirmados aparecen acá." />;
  }

  const chip = (clave: EtapaPrep | "todas", rotulo: string, n: number) => (
    <button
      key={clave}
      type="button"
      onClick={() => setFiltro(clave)}
      aria-pressed={filtro === clave}
      className={cn(
        "inline-flex min-h-12 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold",
        filtro === clave
          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
      )}
    >
      {rotulo} <span className="tabular-nums text-[var(--text-tertiary)]">{n}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por etapa">
        {chip("todas", "Todos", prep.pedidos.length)}
        {ETAPAS.map((e) => {
          const n = cuenta(e);
          return n > 0 || filtro === e ? chip(e, ROTULO_ETAPA[e], n) : null;
        })}
      </div>
      {!puedeAnotar && (
        <p className="text-sm text-[var(--text-tertiary)]">Con tu rol ves la lista, pero no la marcas: lo hace el almacén, caja o el encargado.</p>
      )}
      {visibles.length === 0 ? (
        <Vacio icono={ClipboardList} texto="Ningún pedido en esta etapa." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibles.map((p) => (
            <TarjetaPreparacion
              key={p.id}
              pedido={p}
              ocupado={prep.ocupado === p.id}
              puedeAnotar={puedeAnotar}
              puedeMover={permisos.mover}
              ahora={ahora}
              onCambiar={(c) => prep.cambiar(p.id, c)}
              onEmpezar={() => prep.empezar(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
