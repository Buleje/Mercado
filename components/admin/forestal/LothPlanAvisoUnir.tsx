"use client";

/**
 * El aviso «este plan y el permiso X tienen el mismo código: ¿los unimos?» y
 * la línea de «Plan unido» que sobrevive a la recarga. Salió tal cual de
 * `LothPlanAvisos` (26-10) para dejarlo bajo 300 líneas.
 */

import { useState } from "react";
import { Link2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { permisoGemeloDelPlan } from "@/lib/forestal/loth-plan-permiso";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { Btn } from "./ctp-shared";
import { unirPlanConPermiso } from "./loth-plan-unir";

/** Lo que el aviso de «unir» necesita del plan en pantalla. */
export interface PlanEnPantalla {
  id?: string | null;
  contratoId?: string | null;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
}

/**
 * «Este plan y el permiso X tienen el mismo código: ¿los unimos?».
 *
 * Hoy plan y permiso sólo se atan si el permiso se elige del Directorio al dar
 * de alta el plan; un plan cargado a mano queda suelto aunque su código sea el
 * del permiso (Blas: 19-SEC/REG-PLT-2025-096). Unir usa las MISMAS dos
 * escrituras que el alta con Directorio (`LothPlanForm`): el plan guarda el
 * permiso (`contratoId`) y el permiso guarda su plan (`planId`).
 *
 * Con dos o más permisos candidatos no se sugiere nada (`permisoGemeloDelPlan`).
 */
/** Qué quedó después de unir: con qué permiso y, si el permiso no guardó su plan, por qué. */
export interface Unido {
  planId: string;
  contratoId: string;
  codigo: string;
  pendiente: string | null;
}

/**
 * Lo recién unido, por plan, mientras dure la sesión de la página.
 *
 * Unir recarga los planes, y mientras recargan la vista del plan se desmonta
 * entera (muestra el «cargando»): un estado de React acá se perdía y el aviso
 * desaparecía sin respuesta — medido en el navegador el 29-09: el plan quedó
 * unido y la pantalla no lo dijo. Guardado afuera del componente, la línea
 * «Plan unido al permiso…» sobrevive a esa recarga.
 */
export const unidosEnLaSesion = new Map<string, Unido>();

export function UnirConPermiso({ plan, onUnido }: { plan: PlanEnPantalla & { id: string }; onUnido: (u: Unido) => void }) {
  const { contratos, disponible, actualizar } = usePermisosForestal({ activo: true });
  const [uniendo, setUniendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gemelo = permisoGemeloDelPlan(plan, contratos);
  if (!disponible || !gemelo) return null;
  const permiso = gemelo;

  async function unir() {
    setUniendo(true);
    setError(null);
    try {
      // Las dos escrituras viven en `loth-plan-unir` (las usa también Extracción).
      const { pendiente } = await unirPlanConPermiso(plan.id, permiso.id, actualizar);
      onUnido({ planId: plan.id, contratoId: permiso.id, codigo: permiso.codigo, pendiente });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUniendo(false);
    }
  }

  return (
    <div
      data-aviso-unir={permiso.codigo}
      data-aviso-nivel="info"
      data-aviso-resumen={`Unir con el permiso ${permiso.codigo}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[var(--data-info-500)]/50 bg-[var(--data-info-500)]/10 px-4 py-2.5 text-sm text-[var(--data-info-ink)]"
    >
      <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex min-w-0 grow basis-[18rem] items-center gap-1">
        <span className="min-w-0">
          Este plan y el permiso <span className="font-mono font-bold">{permiso.codigo}</span> tienen el mismo código: ¿los unimos?
        </span>
        <InfoTip
          title="Unir el plan con su permiso"
          what="Es el mismo papel cargado dos veces: una como plan de manejo y otra como permiso del Directorio."
          affects="Unidos, el permiso lleva su plan (censo, especies autorizadas, POA) y el plan su permiso. No se borra ni se cambia nada más."
          example="Si el código no es del mismo papel, no los unas: elige el permiso correcto desde el Directorio."
        />
      </span>
      <Btn variant="primary" size="sm" onClick={() => void unir()} disabled={uniendo} aria-busy={uniendo}>
        {uniendo ? "Uniendo…" : "Unirlos"}
      </Btn>
      {error && <p role="alert" className="basis-full text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>}
    </div>
  );
}
