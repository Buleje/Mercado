"use client";

/**
 * «Varios» del Plan de manejo: todos los planes del negocio en tarjetas,
 * clasificados, para verlos de un vistazo (Brandon 15-10-2026). Elegir una
 * tarjeta abre ese plan, igual que elegirlo en el selector.
 *
 * La clasificación (vigencia · tipo · titular) sale de `clasificarPlanes` y se
 * RECUERDA en el navegador; el avance de cada tarjeta, de `useResumenPlanes`
 * (el mismo balance que lee el plan abierto).
 */

import { useMemo } from "react";
import { BlockTitle, Kicker } from "@buleje/design-system";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  MODOS_CLASIFICAR,
  clasificarPlanes,
  type ModoClasificar,
} from "@/lib/forestal/loth-planes-varios";
import type { Plan } from "./loth-plan-shared";
import { TONO_FICHA } from "./LothFichaPermiso";
import LothPlanTarjeta from "./LothPlanTarjeta";
import { useResumenPlanes } from "./hooks/use-loth-planes-varios";

/** Exportada: la prueba en navegador la lee. */
export const CLAVE_CLASIFICAR_PLANES = "loth:plan:varios-clasificar";

/* Cuántas columnas de la grilla toma un grupo y cuántas usan sus tarjetas,
   según cuántos planes tiene (1, 2, 3 o más). */
const ANCHO_GRUPO = { 1: "", 2: "@min-[40rem]:col-span-2", 3: "col-span-full" } as const;
const COLUMNAS_GRUPO = {
  1: "",
  2: "@min-[40rem]:grid-cols-2",
  3: "@min-[40rem]:grid-cols-2 @min-[72rem]:grid-cols-3",
} as const;

const esModo = (v: unknown): v is ModoClasificar => MODOS_CLASIFICAR.some((m) => m.value === v);

export default function LothPlanesVarios({
  plans,
  planId,
  onElegir,
  reloadSignal,
}: {
  plans: Plan[];
  /** El plan elegido en el libro: su tarjeta va marcada. */
  planId: string | null;
  onElegir: (id: string) => void;
  reloadSignal?: number;
}) {
  const [guardado, setModo] = useLocalStorage<ModoClasificar>(CLAVE_CLASIFICAR_PLANES, "estado");
  const modo: ModoClasificar = esModo(guardado) ? guardado : "estado";
  const grupos = useMemo(() => clasificarPlanes(plans, modo), [plans, modo]);
  const ids = useMemo(() => plans.map((p) => p.id), [plans]);
  const resumen = useResumenPlanes(ids, true, reloadSignal);

  return (
    <section
      aria-label="Todos los planes de manejo"
      data-planes-varios
      className="@container space-y-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1">
          <Kicker>
            {plans.length} {plans.length === 1 ? "plan" : "planes"} de manejo · {grupos.length}{" "}
            {grupos.length === 1 ? "grupo" : "grupos"}
          </Kicker>
          <InfoTip
            title="Varios planes a la vez"
            what="Cada tarjeta es un plan: su tipo, el titular, dónde queda, cuánto lleva y cuánto le queda de plazo."
            affects="Tocar una tarjeta abre ese plan y lo elige para todo el libro, igual que en el selector."
            example="Por vigencia: arriba lo vencido y lo que vence primero. Por titular: los permisos de una misma comunidad, juntos."
          />
        </span>
        <SegmentedControl
          value={modo}
          onChange={setModo}
          options={[...MODOS_CLASIFICAR]}
          size="lg"
          label="Clasificar los planes"
          className="max-sm:w-full max-sm:justify-between sm:ml-auto"
        />
      </div>

      {/* Los grupos chicos se acomodan lado a lado (uno de 1 tarjeta ocupa una
          columna, uno de 2 dos): con 4 planes en 3 grupos, apilados eran tres
          filas con media pantalla vacía cada una. La misma grilla afuera y
          adentro, así las tarjetas quedan alineadas entre grupos. */}
      <div className="grid gap-x-3 gap-y-5 @min-[40rem]:grid-cols-2 @min-[72rem]:grid-cols-3">
        {grupos.map((g) => (
          <div
            key={g.clave}
            className={`min-w-0 space-y-2.5 ${ANCHO_GRUPO[Math.min(g.planes.length, 3) as 1 | 2 | 3]}`}
            data-grupo-planes={g.clave}
          >
            <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] pb-1.5">
              {g.estado && (
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONO_FICHA[g.estado].barra}`}
                />
              )}
              <BlockTitle as="h3" className="min-w-0 truncate">
                {g.titulo}
              </BlockTitle>
              <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                {g.planes.length}
              </span>
            </div>
            {/* Por el ancho del panel, no de la ventana: a 1280 quedan ~960 px
              útiles y tres columnas recortaban las cifras («AUTORIZA…»). */}
            <ul
              className={`grid gap-3 ${COLUMNAS_GRUPO[Math.min(g.planes.length, 3) as 1 | 2 | 3]}`}
            >
              {g.planes.map((item) => (
                <li key={item.plan.id} className="min-w-0">
                  <LothPlanTarjeta
                    item={item}
                    resumen={resumen[item.plan.id]}
                    elegido={item.plan.id === planId}
                    onElegir={onElegir}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
