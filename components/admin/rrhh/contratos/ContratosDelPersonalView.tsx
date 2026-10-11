"use client";

/**
 * ContratosDelPersonalView — los contratos de trabajo/locación del personal,
 * con la columna Persona (ADR-414 §6). Crear y editar siguen en
 * `ContratosModule` — acá sólo se lista y se salta para allá; no se duplica
 * el wizard.
 */

import { useEffect, useMemo, useState } from "react";
import { FileSignature, FileText } from "@buleje/design-system/icons";
import { DataTable, EmptyState, LoadingState } from "@buleje/design-system";
import { useRrhhColaboradores } from "@/hooks/use-rrhh-colaboradores";
import { BOTON, CLASE_CHIP } from "../rrhh-form";
import EncabezadoDeVista from "../EncabezadoDeVista";
import { formatearFecha, pluralizar } from "../rrhh-ui";
import { ESTADO_VISIBLE_LABELS, TIPO_LABELS, estadoVisible, type DbContract, type EstadoVisible } from "@/lib/types/contracts";
import { cn } from "@/lib/utils";

/** Salta al hub de Documentos, sub-pestaña Contratos (mismo patrón que `PorCobrarDashboard`). */
function irAContratos() {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "contratos" } }));
}

const CLASE_ESTADO: Partial<Record<EstadoVisible, string>> = {
  VIGENTE: "bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  POR_VENCER: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  VENCIDO: "bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  PENDIENTE_FIRMA: "bg-[var(--data-info-500)]/10 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
};

export default function ContratosDelPersonalView() {
  const [contratos, setContratos] = useState<DbContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // incluirCesados: un contrato de alguien ya cesado sigue existiendo — sin
  // esto, `nombrePorId` no lo encontraba y la columna Persona mentía "Persona
  // eliminada" para alguien que sigue ahí, sólo que ya no está activo.
  const { colaboradores } = useRrhhColaboradores({ incluirCesados: true }, true);

  useEffect(() => {
    let vigente = true;
    fetch("/api/contratos", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los contratos");
        return r.json() as Promise<{ contratos: DbContract[] }>;
      })
      .then((data) => { if (vigente) setContratos(data.contratos); })
      .catch((err) => { if (vigente) setError(err instanceof Error ? err.message : "No se pudieron cargar los contratos"); });
    return () => { vigente = false; };
  }, []);

  const nombrePorId = useMemo(() => new Map(colaboradores.map((c) => [c.id, c.nombre])), [colaboradores]);

  const delPersonal = useMemo(() => {
    if (!contratos) return [];
    return contratos.filter((c) => c.tipo === "TRABAJO" || c.tipo === "LOCACION" || Boolean(c.colaboradorId));
  }, [contratos]);

  /* Una fila (noche 11-10): la cuenta va junto al botón que lleva a crearlos. */
  const encabezado = (
    <EncabezadoDeVista
      vista="contratos"
      acciones={
        <>
          {delPersonal.length > 0 && <span className="hidden text-sm text-[var(--text-secondary)] sm:inline">{pluralizar(delPersonal.length, "contrato", "contratos")}</span>}
          <button type="button" onClick={irAContratos} className={BOTON.secundario}>
            <FileText className="h-4 w-4" aria-hidden /> Crear o editar en Contratos
          </button>
        </>
      }
    />
  );

  if (!contratos && !error) return <div className="space-y-3">{encabezado}<LoadingState message="Cargando contratos..." /></div>;
  if (error) {
    return <div className="space-y-3">{encabezado}<div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</div></div>;
  }
  if (delPersonal.length === 0) {
    return (
      <div className="space-y-3">
        {encabezado}
        <EmptyState
          icon={FileSignature}
          title="Sin contratos de trabajo todavía"
          description="Los contratos de tipo Trabajo o Locación, o cualquiera vinculado a una persona, aparecen acá."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {encabezado}
      <DataTable zebra>
        <thead>
          <tr>
            <th>Número</th>
            <th>Tipo</th>
            <th>Persona</th>
            <th>Vencimiento</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {delPersonal.map((c) => {
            const estado = estadoVisible(c);
            return (
              <tr key={c.id}>
                <td className="font-semibold">{c.numero}</td>
                <td>{TIPO_LABELS[c.tipo] ?? c.tipo}</td>
                <td>{c.colaboradorId ? (nombrePorId.get(c.colaboradorId) ?? "Persona eliminada") : <span className="text-[var(--text-tertiary)]">Sin vincular</span>}</td>
                <td>{c.fechaVencimiento ? formatearFecha(c.fechaVencimiento) : <span className="text-[var(--text-tertiary)]">Sin fecha</span>}</td>
                <td><span className={cn(CLASE_CHIP, CLASE_ESTADO[estado] ?? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]")}>{ESTADO_VISIBLE_LABELS[estado]}</span></td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
