"use client";

/**
 * «A medida» — la pestaña del panel donde caen las piezas del enchufe
 * `panel.pestana` (ADR-457). Es UN módulo: con una pieza se ve ella sola; con
 * varias, una fila de botones (`?pieza=<id>`).
 *
 * Qué piezas hay lo decide el superadmin por negocio; este archivo no conoce
 * ninguna. Las opciones de cada una se validan otra vez acá con el Zod de su
 * manifiesto: una opción inválida esconde la pieza en vez de romper la pestaña.
 */
import { Ruler } from "@buleje/design-system/icons";
import * as Iconos from "@buleje/design-system/icons";
import { EmptyState, LoadingState } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { BordeDePieza } from "@/lib/extensiones/BordeDePieza";
import { usePiezas } from "@/hooks/use-enabled-specs";
import { PIEZAS_CLIENTE } from "@/extensiones/registro.cliente";
import { usePiezaActiva } from "./use-pieza-activa";

type Icono = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function icono(nombre: string): Icono {
  const candidato = (Iconos as unknown as Record<string, unknown>)[nombre];
  return (typeof candidato === "function" || (typeof candidato === "object" && candidato !== null)
    ? candidato
    : Ruler) as Icono;
}

export default function ALaMedidaModule() {
  const { piezas, isLoading } = usePiezas("panel.pestana");

  const visibles = piezas.flatMap((asignada) => {
    const entrada = PIEZAS_CLIENTE[asignada.piezaId];
    if (!entrada?.pestana) return [];
    const opciones = entrada.manifiesto.opciones.safeParse(asignada.opciones);
    return opciones.success ? [{ id: asignada.piezaId, pestana: entrada.pestana, opciones: opciones.data }] : [];
  });

  const { activa, irA } = usePiezaActiva(visibles.map((v) => v.id));
  const actual = visibles.find((v) => v.id === activa);

  if (isLoading && visibles.length === 0) return <LoadingState message="Cargando tu pestaña…" />;

  return (
    <div className="space-y-4" data-modulo="a-medida">
      <AdminModuleHeader title="A medida" description="Herramientas hechas para tu negocio" icon={Ruler} />

      {visibles.length > 1 && (
        <div role="tablist" aria-label="Piezas a medida" className="flex flex-wrap gap-2">
          {visibles.map((v) => {
            const Ico = icono(v.pestana.icono);
            const esta = v.id === activa;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={esta}
                onClick={() => irA(v.id)}
                className={`inline-flex h-11 items-center gap-2 rounded-xl border-2 px-4 text-base font-bold transition ${
                  esta
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                <Ico className="h-5 w-5" aria-hidden />
                {v.pestana.titulo}
              </button>
            );
          })}
        </div>
      )}

      {actual ? (
        <BordeDePieza
          key={actual.id}
          piezaId={actual.id}
          fallback={<EmptyState title="Esta pieza no pudo abrirse" description="Avisa a soporte. El resto del panel sigue igual." />}
        >
          <actual.pestana.Vista opciones={actual.opciones} />
        </BordeDePieza>
      ) : (
        !isLoading && (
          <EmptyState title="Todavía no tienes nada a medida" description="Cuando pidas una herramienta para tu negocio, aparecerá aquí." />
        )
      )}
    </div>
  );
}
