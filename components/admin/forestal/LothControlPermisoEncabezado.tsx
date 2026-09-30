"use client";

/**
 * Lo que va arriba de «Estado de las trozas» en «Control del permiso», en el
 * orden en que se pregunta:
 *
 *   1. Ficha del permiso — ¿con qué papel trabajo y cuánto le queda?
 *      + Planes vivos (sólo si hay 2+): el plan vigente que `?active=1` deja fuera.
 *   2. Saldo por especie (plegable) — ¿cuánto me deja talar todavía cada especie?
 *   3. Cuadre por guía (plegable) — ¿lo que declara cada GTF es lo que salió?
 *
 * No lee nada por su cuenta: la carátula, el plan del libro, el censo y las
 * especies autorizadas los trae el libro; las trozas cruzadas, TODAS las GTF
 * (anuladas incluidas) y los planes los trae el tablero (`useTableroContexto`).
 * Acá sólo se calcula con las funciones puras y se pinta.
 */

import { useMemo } from "react";
import type { CaratulaFicha, PlanFicha } from "@/lib/forestal/loth-ficha-permiso";
import { planesVivos } from "@/lib/forestal/loth-ficha-permiso";
import {
  VEREDICTOS_META,
  VEREDICTOS_ROJOS,
  contarVeredictos,
  cuadrarGuias,
  type VeredictoGuia,
} from "@/lib/forestal/loth-cuadre-guias";
import { saldoPorEspecie, type EntradaSaldo } from "@/lib/forestal/loth-saldo-especie";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { DatosEncabezadoTablero } from "./LothTableroTrozas";
import LothFichaPermiso from "./LothFichaPermiso";
import LothPlanesVivos from "./LothPlanesVivos";
import LothSaldoEspecies, { AYUDA_SALDO } from "./LothSaldoEspecies";
import { LothCuadreGuias } from "./LothCuadreGuias";
import { SeccionPlegable } from "./loth-seccion-plegable";

/** Claves de localStorage de las dos plegables (una por bloque). */
export const CLAVE_PLEGABLE_SALDO = "loth-control-saldo-abierto-v1";
export const CLAVE_PLEGABLE_CUADRE = "loth-control-cuadre-abierto-v1";

export interface LothControlPermisoEncabezadoProps {
  datos: DatosEncabezadoTablero;
  caratula: CaratulaFicha | null;
  /** El plan de `?active=1`: contra él se miden la ficha grande, el saldo y el cupo. */
  planActivo: (PlanFicha & { id: string }) | null;
  /** Censo + libro + autorizadas del plan del libro (lo mismo que alimenta el cupo). */
  saldo: Omit<EntradaSaldo, "planId">;
  onCompletarCaratula?: () => void;
  onCompletarPlan?: () => void;
  onVerGtf?: (gtf: string) => void;
}

const AYUDA_CUADRE = {
  what: "Una fila por guía: los m³ y las piezas que declara la GTF contra la suma de las trozas que la citan en «Despacho de trozas».",
  affects:
    "Es el cruce que hace el inspector. «No cuadra» = salió madera sin respaldo o falta asentar una troza. Una guía citada que no está registrada, o que está anulada, deja la troza sin origen legal.",
  example: "GTF 019-0000002 declara 4,951 m³ y 1 pieza; en el libro la cita la troza 111-A con 4,951 m³ → cuadra.",
} as const;

/** Orden de lectura del resumen: lo que pide atención primero. */
const ORDEN_VEREDICTOS = (Object.keys(VEREDICTOS_META) as VeredictoGuia[]).sort(
  (a, b) => VEREDICTOS_META[a].orden - VEREDICTOS_META[b].orden,
);

export default function LothControlPermisoEncabezado({
  datos,
  caratula,
  planActivo,
  saldo,
  onCompletarCaratula,
  onCompletarPlan,
  onVerGtf,
}: LothControlPermisoEncabezadoProps) {
  const activoId = planActivo?.id ?? null;
  const vivos = useMemo(() => planesVivos(datos.planes ?? [], activoId), [datos.planes, activoId]);
  // La ficha grande sigue al plan del libro; si `?active=1` no llegó, al primero vivo.
  const planFicha = planActivo ?? vivos[0] ?? null;

  const saldoPlan = useMemo(
    () => saldoPorEspecie({ ...saldo, planId: activoId }),
    [saldo, activoId],
  );
  const saldoRojo = saldoPlan.filas.some((f) => f.veredicto === "excedido");
  const tot = saldoPlan.totales;

  // Sin la lista de guías no se cuadra: cruzar contra [] acusaría a todas de «citada, sin registrar».
  const cuadre = useMemo(
    () => (datos.gtfs ? cuadrarGuias(datos.filas, datos.gtfs) : null),
    [datos.filas, datos.gtfs],
  );
  const conteo = useMemo(() => (cuadre ? contarVeredictos(cuadre) : null), [cuadre]);
  const cuadreRojo = conteo != null && VEREDICTOS_ROJOS.some((v) => conteo[v] > 0);

  return (
    <div className="space-y-3">
      <LothFichaPermiso
        caratula={caratula}
        plan={planFicha}
        onCompletarCaratula={onCompletarCaratula}
        onCompletarPlan={onCompletarPlan}
      />
      <LothPlanesVivos planes={vivos} activoId={activoId} onCompletarPlan={onCompletarPlan} />

      <SeccionPlegable
        clave={CLAVE_PLEGABLE_SALDO}
        titulo="Saldo por especie"
        ayuda={AYUDA_SALDO}
        rojo={saldoRojo}
        resumen={
          saldoPlan.filas.length === 0 ? (
            <span>Sin censo ni especies autorizadas en el plan del libro</span>
          ) : (
            <span className="tabular-nums">
              <b className="font-semibold text-[var(--text-primary)]">{fmtM3(tot.saldoPorTalarM3)} m³</b> por talar
              {" · "}
              <b className="font-semibold text-[var(--text-primary)]">{fmtM3(tot.enPatioM3)} m³</b> en patio
              {tot.excesoM3 > 0 && (
                <b className="font-bold text-[var(--data-error-ink)]"> · excedido +{fmtM3(tot.excesoM3)} m³</b>
              )}
            </span>
          )
        }
      >
        <LothSaldoEspecies saldo={saldoPlan} sinCabecera />
      </SeccionPlegable>

      <SeccionPlegable
        clave={CLAVE_PLEGABLE_CUADRE}
        titulo="Cuadre por guía"
        ayuda={AYUDA_CUADRE}
        rojo={cuadreRojo}
        resumen={
          !conteo ? (
            <span>{datos.cargando ? "Leyendo las guías…" : "No se pudieron leer las guías"}</span>
          ) : cuadre && cuadre.length === 0 ? (
            <span>Sin guías todavía</span>
          ) : (
            <span className="tabular-nums">
              {cuadre?.length} {cuadre?.length === 1 ? "guía" : "guías"}
              {ORDEN_VEREDICTOS.filter((v) => conteo[v] > 0).map((v) => (
                <span
                  key={v}
                  className={VEREDICTOS_ROJOS.includes(v) ? "font-bold text-[var(--data-error-ink)]" : undefined}
                >
                  {" · "}
                  {VEREDICTOS_META[v].label} {conteo[v]}
                </span>
              ))}
            </span>
          )
        }
      >
        {cuadre ? (
          <LothCuadreGuias filas={cuadre} onVerGtf={onVerGtf} />
        ) : (
          <p role={datos.cargando ? undefined : "alert"} className="text-sm text-[var(--text-secondary)]">
            {datos.cargando
              ? "Leyendo las guías emitidas…"
              : "No se pudieron leer las guías emitidas: sin ellas no se puede cuadrar. Vuelve a cargar la vista."}
          </p>
        )}
      </SeccionPlegable>
    </div>
  );
}
