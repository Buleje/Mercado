"use client";

/**
 * Los avisos del plan: lo que obliga a hacer algo HOY.
 *
 * Van arriba y FUERA de las pestañas (como en Saldos del Libro CTP): un aviso
 * escondido detrás de una pestaña es un aviso que nadie ve.
 *
 *   · el censo vino cortado → todo lo que se calcula sobre él es parcial;
 *   · la VIGENCIA del plan venció o está por vencer;
 *   · una especie censada que NO figura en la resolución (tala no autorizada);
 *   · una especie con más árboles censados que los autorizados;
 *   · el plan y un permiso tienen el MISMO código y no están unidos (un clic).
 *
 * Cuando todo cuadra queda una sola línea, sin caja: «todo en regla» no es un
 * aviso y no debe pesar como uno.
 */

import { useState } from "react";
import { AlertTriangle, Ban, CalendarClock, CheckCircle2, Link2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { avisoDeVigencia } from "@/lib/forestal/vigencia-avisos";
import { permisoGemeloDelPlan } from "@/lib/forestal/loth-plan-permiso";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { Btn } from "./ctp-shared";
import { unirPlanConPermiso } from "./loth-plan-unir";
import type { ControlRow } from "./loth-plan-shared";
import { formatNumber } from "@/lib/format";

/** Lo que el aviso de «unir» necesita del plan en pantalla. */
interface PlanEnPantalla {
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
interface Unido {
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
const unidosEnLaSesion = new Map<string, Unido>();

function UnirConPermiso({ plan, onUnido }: { plan: PlanEnPantalla & { id: string }; onUnido: (u: Unido) => void }) {
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

export default function LothPlanAvisos({ rows, onResolver, truncado, plan, onPlanUnido }: {
  rows: ControlRow[];
  onResolver?: (especie: string) => void;
  /** El censo tiene `total` árboles y se cargaron `cargados`. */
  truncado?: { total: number; cargados: number } | null;
  /**
   * El plan que está en pantalla, para avisar antes de que venza.
   *
   * La cabecera ya pinta «por vencer», pero un color hay que estar mirándolo:
   * acá el aviso dice los días y qué se rompe. La regla es la misma que usa el
   * Libro CTP para el permiso (`vigencia-avisos`), así que el mismo papel no
   * puede decir días distintos en dos pantallas.
   */
  plan?: ({ codigo?: string | null; vigenciaHasta?: string | null; estado?: string | null } & PlanEnPantalla) | null;
  /** Después de unir el plan con su permiso: recargar el plan. */
  onPlanUnido?: () => void;
}) {
  const [, setVersion] = useState(0);
  const hasCenso = rows.some((r) => r.censadoCount > 0);
  const noAut = rows.filter((r) => r.flags.includes("no_autorizada"));
  const excArb = rows.filter((r) => r.flags.includes("exceso_arboles"));
  const todoBien = hasCenso && noAut.length === 0 && excArb.length === 0;
  const vigencia = plan
    ? avisoDeVigencia({
        id: "plan",
        codigo: plan.codigo,
        vigenciaHasta: plan.vigenciaHasta,
        estado: plan.estado,
        clase: "plan",
      })
    : null;
  /* Sólo se busca un permiso gemelo para un plan con id y SIN permiso: un plan
     ya unido no pide nada (y no se gasta una consulta). */
  const planSinPermiso = plan?.id && !plan.contratoId ? { ...plan, id: plan.id } : null;
  /* Lo que se unió queda dicho aunque el plan se recargue (y el aviso de unir,
     que ya no aplica, se vaya): un aviso que desaparece sin respuesta parece
     un clic perdido. */
  const recien = plan?.id ? unidosEnLaSesion.get(plan.id) ?? null : null;
  // Si después alguien lo soltó o lo cambió de permiso, la línea ya no es cierta.
  const unidoAca = recien && (!plan?.contratoId || plan.contratoId === recien.contratoId) ? recien : null;
  if (!truncado && !hasCenso && !vigencia && !planSinPermiso && !unidoAca) return null;

  return (
    <div className="space-y-2">
      {/* ⛔ Antes que cualquier otro número: si el censo vino cortado, TODO lo
          que sigue —aprovechables, volumen sobre DMC, intensidad por
          hectárea, el cuadre por especie— está calculado sobre una parte. Un
          POA equivocado que se ve completo es peor que uno que falta. */}
      {truncado && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El censo tiene {formatNumber(truncado.total)} árboles y se cargaron {formatNumber(truncado.cargados)}.
            Todo el Plan Operativo está calculado sobre esos {formatNumber(truncado.cargados)}: no lo uses para declarar
            hasta filtrar por parcela o estado.
          </span>
        </p>
      )}

      {/* La vigencia va antes que el cuadre por especie: de un plan vencido no
          se moviliza nada, por más que el censo cierre perfecto. Vencido es
          rojo (ya pasó); por vencer es coral (todavía se puede renovar). */}
      {vigencia && (
        <p
          data-aviso-vigencia={vigencia.nivel}
          className={`flex items-start gap-2 rounded-xl border-2 p-3 text-sm ${
            vigencia.nivel === "vencido"
              ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
              : "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
          }`}
        >
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">{vigencia.titulo}.</span>{" "}
            <span className="font-medium">{vigencia.detalle}</span>
          </span>
        </p>
      )}

      {/* Unir va después de lo que bloquea (censo cortado, vigencia): es un
          arreglo de un clic, no una urgencia. */}
      {planSinPermiso && !unidoAca && (
        <UnirConPermiso
          key={planSinPermiso.id}
          plan={planSinPermiso}
          onUnido={(u) => {
            unidosEnLaSesion.set(u.planId, u);
            setVersion((v) => v + 1);
            onPlanUnido?.();
          }}
        />
      )}
      {unidoAca && (
        <div role="status" data-aviso-unir="unido" className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--data-success-ink)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {/* Un solo hijo de texto: en un flex con gap, el punto suelto quedaba separado. */}
            <span>
              Plan unido al permiso <span className="font-mono font-bold">{unidoAca.codigo}</span>.
            </span>
          </p>
          {unidoAca.pendiente && (
            <p className="text-sm font-semibold text-[var(--data-error-ink)]">
              El permiso no guardó su plan: {unidoAca.pendiente}
            </p>
          )}
        </div>
      )}

      {todoBien && (
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Todo el censo corresponde a especies autorizadas en el plan.
        </p>
      )}

      {noAut.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
          <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 grow basis-[20rem]">
            <span className="font-bold">Especie(s) censada(s) fuera del plan aprobado: </span>
            {noAut.map((r) => r.species).join(", ")}.{" "}
            <span className="font-medium">Talar o movilizar una especie no autorizada es infracción — corrige el plan o el censo antes de emitir GTF.</span>
          </p>
          {/* El aviso trae el camino: antes decía qué estaba mal y había que
              salir a buscar dónde se arregla. */}
          <span className="flex shrink-0 flex-wrap gap-1.5">
            {noAut.map((r) => (
              <button
                key={r.species}
                type="button"
                onClick={() => onResolver?.(r.species)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--data-error-700)] px-3 text-xs font-bold text-white transition-opacity hover:opacity-90"
              >
                Resolver {r.species}
              </button>
            ))}
          </span>
        </div>
      )}

      {excArb.map((r) => (
        <div key={r.species} className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] px-4 py-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div><span className="font-bold">{r.species}:</span> censados {r.censadoCount} árboles &gt; {r.autorizadoArboles} autorizados en la resolución.</div>
        </div>
      ))}
    </div>
  );
}
