"use client";

/**
 * HistorialSeccion — las versiones guardadas de una sección del plan y volver
 * a una de ellas (ADR-497). Volver no borra nada: guarda la vieja como una
 * versión nueva, así que también se puede deshacer.
 */
import { useEffect, useState } from "react";
import { History, RotateCcw } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { cuerpoJson, usePlanEmpresa, useSeccionPlan } from "@/hooks/use-plan-empresa";
import type { SeccionPlan, VersionSeccion } from "@/lib/planificacion/secciones";
import { timeAgo } from "@/lib/utils";

interface Props {
  seccion: SeccionPlan;
  titulo: string;
  abierto: boolean;
  onCerrar: () => void;
}

export function HistorialSeccion({ seccion, titulo, abierto, onCerrar }: Props) {
  const { recargar } = usePlanEmpresa();
  const { version: actual, puedeEditar, estado } = useSeccionPlan(seccion);
  const { confirm: confirmar } = useConfirm();
  const [versiones, setVersiones] = useState<VersionSeccion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volviendo, setVolviendo] = useState<number | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setVersiones(null);
    setError(null);
    fetch(`/api/admin/planificacion/${seccion}/historial`, { cache: "no-store" })
      .then(async (r) => {
        const body = (await cuerpoJson(r)) as ({ error?: string; versiones?: VersionSeccion[] }) | null;
        if (!r.ok) throw new Error(body?.error ?? "No se pudo leer el historial");
        if (vivo) setVersiones((body as { versiones: VersionSeccion[] }).versiones);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer el historial"));
    return () => {
      vivo = false;
    };
  }, [abierto, seccion, actual]);

  async function volverA(v: VersionSeccion) {
    if (estado !== "guardado") {
      toast.error("Espera a que se guarde lo que estás escribiendo.");
      return;
    }
    const ok = await confirmar({
      title: `¿Volver a la versión ${v.version}?`,
      description: "Lo de ahora queda guardado como una versión más: puedes regresar.",
      confirmLabel: "Volver a esta",
    });
    if (!ok) return;
    setVolviendo(v.version);
    try {
      const r = await fetch(`/api/admin/planificacion/${seccion}/historial`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ version: v.version }),
      });
      const body = (await cuerpoJson(r)) as ({ error?: string; versiones?: VersionSeccion[] }) | null;
      if (!r.ok) throw new Error(body?.error ?? "No se pudo volver a esa versión");
      toast.success(`${titulo}: volviste a la versión ${v.version}.`);
      recargar();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo volver a esa versión");
    } finally {
      setVolviendo(null);
    }
  }

  return (
    <AdminModal open={abierto} onClose={onCerrar} title={`Versiones de «${titulo}»`} icon={History} size="md">
      {error ? (
        <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
      ) : versiones === null ? (
        <div role="status" aria-label="Cargando" className="flex justify-center py-8">
          <LoadingSpinner size={28} />
        </div>
      ) : versiones.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Todavía no hay versiones guardadas.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {versiones.map((v) => (
            <li key={v.version} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Versión {v.version}
                  {v.version === actual ? " · la de ahora" : ""}
                </span>
                <span className="block text-sm text-[var(--text-secondary)]">
                  {v.autor} · {timeAgo(v.creado)}
                </span>
              </div>
              {puedeEditar && v.version !== actual && (
                <button
                  type="button"
                  className={button({ variant: "secondary", size: "sm" })}
                  disabled={volviendo !== null}
                  onClick={() => void volverA(v)}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  {volviendo === v.version ? "Volviendo…" : "Volver a esta"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminModal>
  );
}
