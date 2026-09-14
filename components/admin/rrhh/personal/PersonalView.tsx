"use client";

/**
 * PersonalView — la lista de personas (ADR-414 §7, vista `personal`).
 *
 * Filtros en la cabecera (convención del panel): el estado se recorta EN EL
 * CLIENTE sobre una lista ya traída con `incluirCesados=1` — así los chips de
 * estado no disparan un fetch por click, y los KPIs de arriba (que cuentan
 * TODO el personal) no dependen de qué chip esté activo.
 */

import { useMemo, useState } from "react";
import { Plus, Search } from "@buleje/design-system/icons";
import { DataTable, EmptyState, LoadingState, StatCard } from "@buleje/design-system";
import { Users } from "@buleje/design-system/icons";
import { useRrhhColaboradores } from "@/hooks/use-rrhh-colaboradores";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { CLASE_FOCUS_FILA, COLABORADOR_ESTADO_META, filaClicableProps } from "../rrhh-ui";
import { cn } from "@/lib/utils";
import ColaboradorFormModal from "./ColaboradorFormModal";
import FichaColaboradorModal from "./FichaColaboradorModal";
import type { EstadoColaborador, NivelRrhh } from "@/lib/rrhh/tipos";

const CHIPS_ESTADO: { id: EstadoColaborador | "TODOS"; label: string }[] = [
  { id: "TODOS", label: "Todos" },
  { id: "ACTIVO", label: "Activos" },
  { id: "VACACIONES", label: "Vacaciones" },
  { id: "LICENCIA", label: "Licencia" },
  { id: "SUSPENDIDO", label: "Suspendidos" },
  { id: "CESADO", label: "Cesados" },
];

export default function PersonalView({ nivel }: { nivel: NivelRrhh }) {
  const [q, setQ] = useState("");
  const [puestoId, setPuestoId] = useState("");
  const [chip, setChip] = useState<EstadoColaborador | "TODOS">("ACTIVO");
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null);

  const { colaboradores, loading, error, recargar } = useRrhhColaboradores(
    { q: q || undefined, puestoId: puestoId || undefined, incluirCesados: true },
    false,
  );
  const { puestos } = useRrhhPuestos();

  const kpis = useMemo(() => {
    const base: Record<EstadoColaborador, number> = { ACTIVO: 0, VACACIONES: 0, LICENCIA: 0, SUSPENDIDO: 0, CESADO: 0 };
    for (const c of colaboradores) base[c.estado] += 1;
    return base;
  }, [colaboradores]);

  const filtrados = chip === "TODOS" ? colaboradores : colaboradores.filter((c) => c.estado === chip);

  const puedeEditar = nivel === "gestion" || nivel === "completo";

  if (loading) return <LoadingState message="Cargando el personal..." />;
  if (error) {
    return (
      <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {error} <button type="button" onClick={recargar} className="ml-2 font-bold underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Activos" value={kpis.ACTIVO} emphasis="success" density="compact" />
        <StatCard label="Vacaciones/licencia" value={kpis.VACACIONES + kpis.LICENCIA} density="compact" />
        <StatCard label="Suspendidos" value={kpis.SUSPENDIDO} emphasis={kpis.SUSPENDIDO > 0 ? "warning" : "neutral"} density="compact" />
        <StatCard label="Cesados" value={kpis.CESADO} density="compact" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre..."
            className="h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
        </div>
        <select
          value={puestoId}
          onChange={(e) => setPuestoId(e.target.value)}
          className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todos los puestos</option>
          {puestos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => setAltaAbierta(true)}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-white hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> Persona
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CHIPS_ESTADO.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChip(c.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
              chip === c.id
                ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title={colaboradores.length === 0 ? "Agrega a tu primera persona" : "Nadie coincide"}
          description={colaboradores.length === 0 ? "Nombre, puesto y desde cuándo trabaja contigo." : "Prueba con otro filtro o busca otro nombre."}
          action={puedeEditar && colaboradores.length === 0 ? { label: "Agregar persona", onClick: () => setAltaAbierta(true) } : undefined}
        />
      ) : (
        <DataTable zebra>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Estado</th>
              <th>Documento</th>
              <th>Celular</th>
              <th>Ingreso</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const meta = COLABORADOR_ESTADO_META[c.estado];
              return (
                <tr
                  key={c.id}
                  onClick={() => setFichaAbierta(c.id)}
                  {...filaClicableProps(() => setFichaAbierta(c.id))}
                  aria-label={`Abrir la ficha de ${c.nombre}`}
                  className={cn("cursor-pointer", CLASE_FOCUS_FILA)}
                >
                  <td className="font-semibold text-[var(--text-primary)]">
                    {c.nombre}
                    {c.apodo && <span className="ml-1 font-normal text-[var(--text-tertiary)]">«{c.apodo}»</span>}
                  </td>
                  <td>{c.puesto?.nombre ?? <span className="text-[var(--text-tertiary)]">Sin puesto</span>}</td>
                  <td><span className={cn("rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold", meta.claseChip)}>{meta.label}</span></td>
                  <td className="font-mono text-xs">{c.documento ?? "—"}</td>
                  <td>{c.celular ?? "—"}</td>
                  <td>{c.fechaIngreso ?? <span className="text-[var(--text-tertiary)]">No se sabe</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {altaAbierta && (
        <ColaboradorFormModal
          open={altaAbierta}
          onClose={() => setAltaAbierta(false)}
          nivel={nivel}
          onGuardado={() => { setAltaAbierta(false); recargar(); }}
        />
      )}
      {fichaAbierta && (
        <FichaColaboradorModal
          open
          colaboradorId={fichaAbierta}
          onClose={() => setFichaAbierta(null)}
          nivel={nivel}
          onCambio={recargar}
        />
      )}
    </div>
  );
}
