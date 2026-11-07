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
 *   · el plan y un permiso tienen el MISMO código y no están unidos (un clic);
 *   · el SEMÁFORO (Brandon 24-10): saldo casi usado o pasado, despachos sin
 *     asentar y la ficha incompleta, con «Completar la ficha».
 *
 * Cuando todo cuadra queda una sola línea, sin caja: «todo en regla» no es un
 * aviso y no debe pesar como uno.
 */

import { useState } from "react";
import { AlertTriangle, Ban, CalendarClock, CheckCircle2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { avisoDeVigencia } from "@/lib/forestal/vigencia-avisos";
import { UnirConPermiso, unidosEnLaSesion, type PlanEnPantalla } from "./LothPlanAvisoUnir";
import type { ControlRow } from "./loth-plan-shared";
import { formatNumber } from "@/lib/format";
import type { PasoPlan } from "@/lib/forestal/loth-plan-pasos";
import LothPlanSemaforoAviso, { razonesDelAviso } from "./LothPlanSemaforoAviso";
import type { SemaforoDeLaPantalla } from "./hooks/use-loth-semaforo-libro";


/** «Plan de manejo PO 12 vence en 30 días» → «Vence en 30 días» (el resumen de la franja). */
export function resumenVigencia(titulo: string): string {
  const m = /\s(venció|vence)(\s.*)$/.exec(titulo);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)}${m[2]}` : titulo;
}

export default function LothPlanAvisos({ rows, onResolver, truncado, plan, onPlanUnido, plantacion = false, semaforo, onCompletarFicha, onVerPapeles }: {
  rows: ControlRow[];
  /** Registro de plantación (ADR-459): se habla de registro y árboles marcados, no de resolución y censo. */
  plantacion?: boolean;
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
  /** El semáforo del plan (`semaforoDeLaPantalla`): lo que no dicen los otros avisos. */
  semaforo?: SemaforoDeLaPantalla | null;
  /** «Completar la ficha»: abre el formulario del plan en ese paso. */
  onCompletarFicha?: (paso: PasoPlan | null) => void;
  onVerPapeles?: () => void;
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
  const conSemaforo = semaforo != null && razonesDelAviso(semaforo.semaforo, vigencia != null).length > 0;
  if (!truncado && !hasCenso && !vigencia && !planSinPermiso && !unidoAca && !conSemaforo) return null;

  return (
    /* `contents`: cada aviso es hijo directo de la franja (`LothPlanAvisosFranja`),
       que los cuenta y pliega por su `data-aviso-nivel`. */
    <div className="contents">
      {/* ⛔ Antes que cualquier otro número: si el censo vino cortado, TODO lo
          que sigue —aprovechables, volumen sobre DMC, intensidad por
          hectárea, el cuadre por especie— está calculado sobre una parte. Un
          POA equivocado que se ve completo es peor que uno que falta. */}
      {truncado && (
        <p data-aviso-nivel="rojo" data-aviso-resumen="Censo cargado a medias" className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
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
          /* A una semana de vencer ya no se pliega: queda a la vista como lo rojo. */
          data-aviso-nivel={vigencia.nivel === "vencido" || vigencia.gravedad === "urgente" ? "rojo" : "ambar"}
          data-aviso-resumen={resumenVigencia(vigencia.titulo)}
          className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm ${
            vigencia.nivel === "vencido"
              ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
              : "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
          }`}
        >
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 font-bold">{vigencia.titulo}.</span>
          <InfoTip
            title={vigencia.nivel === "vencido" ? "El plan ya venció" : "El plan está por vencer"}
            ariaLabel="Qué pasa cuando vence el plan"
            what={vigencia.detalle}
            example="Renovarlo ante la ARFFS toma meses: empieza el trámite apenas veas este aviso."
          />
        </p>
      )}

      {semaforo && (
        <LothPlanSemaforoAviso semaforo={semaforo.semaforo} ficha={semaforo.ficha} vigenciaDicha={vigencia != null} onCompletarFicha={onCompletarFicha} onVerPapeles={onVerPapeles} />
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
        <div role="status" data-aviso-unir="unido" data-aviso-nivel={unidoAca.pendiente ? "rojo" : "ok"} className="space-y-1">
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
        <p data-aviso-nivel="ok" className="flex items-center gap-2 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {plantacion
            ? "Todos los árboles marcados son de especies del registro."
            : "Todo el censo corresponde a especies autorizadas en el plan."}
        </p>
      )}

      {noAut.length > 0 && (
        <div
          data-aviso-nivel="rojo"
          data-aviso-resumen="Especie fuera del plan"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
          <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="flex min-w-0 grow basis-[16rem] items-center gap-1">
            <span className="min-w-0">
              <span className="font-bold">
                {plantacion ? "Especie(s) marcada(s) fuera del registro: " : "Especie(s) censada(s) fuera del plan aprobado: "}
              </span>
              {noAut.map((r) => r.species).join(", ")}.
            </span>
            <InfoTip
              title="Especie fuera del plan"
              ariaLabel="Por qué una especie fuera del plan es infracción"
              what={plantacion
                ? "Talar o movilizar una especie que no está en el registro es infracción — corrige el registro o los árboles antes de emitir GTF."
                : "Talar o movilizar una especie no autorizada es infracción — corrige el plan o el censo antes de emitir GTF."}
              affects="«Resolver» te deja agregarla al plan (si la resolución la autoriza) o sacar sus árboles del censo."
            />
          </p>
          {/* El aviso trae el camino: antes decía qué estaba mal y había que
              salir a buscar dónde se arregla. */}
          <span className="flex shrink-0 flex-wrap gap-1.5">
            {noAut.map((r) => (
              <button
                key={r.species}
                type="button"
                onClick={() => onResolver?.(r.species)}
                className="inline-flex h-12 items-center gap-1.5 rounded-lg bg-[var(--data-error-700)] px-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                Resolver {r.species}
              </button>
            ))}
          </span>
        </div>
      )}

      {excArb.map((r) => (
        <div
          key={r.species}
          data-aviso-nivel="ambar"
          data-aviso-resumen={`${r.species}: más árboles que los autorizados`}
          className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <span className="font-bold">{r.species}:</span>{" "}
            {plantacion
              ? <>marcados {r.censadoCount} árboles &gt; {r.autorizadoArboles} del registro.</>
              : <>censados {r.censadoCount} árboles &gt; {r.autorizadoArboles} autorizados en la resolución.</>}
          </div>
        </div>
      ))}
    </div>
  );
}
