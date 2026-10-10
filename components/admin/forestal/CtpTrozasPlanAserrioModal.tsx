"use client";

/**
 * «Plan de aserrío del día» — qué trozas van hoy a la sierra (Brandon 05-10:
 * «lunes 7 am imprimes "Hoy: 6 de tornillo, ≈1.900 pt"»).
 *
 * Arma la lista sola con las reglas de `lib/forestal/plan-aserrio` (sólo
 * libres, la más vieja primero, por especie, hasta la meta), deja quitar y
 * agregar a mano, la IMPRIME para el operario y la APARTA en un lote para la
 * corrida: la corrida que toma el lote consume esas trozas y salen solas del
 * patio y de este plan, que se recalcula con cada lectura.
 *
 * No lee nada: recibe el patio que la vista ya tiene (`useTrozasPatio`).
 */

import { useMemo, useState } from "react";
import { ClipboardList, PackagePlus, Printer, RotateCcw } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtPct } from "@/lib/forestal/cubicacion-formato";
import {
  OBJETIVO_META,
  especiesLibres,
  planDeAserrio,
  resumenDelPlan,
  type ObjetivoPlan,
} from "@/lib/forestal/plan-aserrio";
import { Btn, ModalBody } from "./ctp-shared";
import CtpTrozasPlanControles from "./ctp-trozas-plan-controles";
import { diaDelPlan, imprimirPlanAserrio } from "./ctp-trozas-plan-print";
import CtpTrozasPlanTabla from "./ctp-trozas-plan-tabla";
import type { UbicacionDeCarga } from "./hooks/use-planta-ubicacion";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

/** Lo mismo que recibe `CtpApartarEnLoteModal`. */
export interface PiezaParaApartar {
  id: string;
  codigo: string | null;
  especie: string | null;
}

const sinUna = (s: ReadonlySet<string>, id: string) => new Set([...s].filter((x) => x !== id));

export default function CtpTrozasPlanAserrioModal({
  trozas,
  hoy,
  canchas,
  rendimientoPct,
  onApartar,
  onVerFicha,
  onClose,
}: {
  /** El patio entero tal como lo trae `useTrozasPatio` (el plan elige las libres). */
  trozas: readonly TrozaPatioAPI[];
  hoy: Date;
  /** `woodEntryId → cancha` (`usePlantaUbicacion`). */
  canchas: Record<string, UbicacionDeCarga>;
  /** `meta.rendimientoLibro?.pct`. Sin él no se estiman pies tablares. */
  rendimientoPct?: number | null;
  /** Cierra el plan y le pasa las piezas a «Apartar en un lote». */
  onApartar: (piezas: PiezaParaApartar[]) => void;
  onVerFicha?: (id: string) => void;
  onClose: () => void;
}) {
  const especies = useMemo(() => especiesLibres(trozas, hoy), [trozas, hoy]);
  const [elegidas, setElegidas] = useState<string[]>(() => (especies[0] ? [especies[0].especie] : []));
  const [objetivo, setObjetivo] = useState<ObjetivoPlan>({ tipo: "piezas", valor: OBJETIVO_META.piezas.inicial });
  const [quitadas, setQuitadas] = useState<ReadonlySet<string>>(new Set());
  const [agregadas, setAgregadas] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () => planDeAserrio(trozas, { hoy, especies: elegidas, objetivo, rendimientoPct, canchas, quitadas, agregadas }),
    [trozas, hoy, elegidas, objetivo, rendimientoPct, canchas, quitadas, agregadas],
  );
  const filas = plan.grupos.flatMap((g) => g.filas);
  const cambiosAMano = quitadas.size + agregadas.size;

  const imprimir = () => {
    setError(null);
    try {
      imprimirPlanAserrio(plan, hoy);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const apartar = () => {
    onApartar(filas.map((f) => ({ id: f.id, codigo: f.codigo, especie: f.especie })));
    onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      icon={ClipboardList}
      title="Plan de aserrío del día"
      description={`${diaDelPlan(hoy)} · las libres más viejas primero`}
      ventana
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Btn onClick={onClose}>Cerrar</Btn>
          <span className="ml-auto" />
          <Btn onClick={imprimir} disabled={filas.length === 0}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir para el operario
          </Btn>
          <Btn variant="primary" onClick={apartar} disabled={filas.length === 0}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" /> Apartar para la corrida
          </Btn>
        </div>
      }
    >
      <ModalBody className="space-y-4">
        {especies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)]">
            No hay trozas libres en el patio: lo que queda ya está apartado para una corrida o aserrado.
          </p>
        ) : (
          <>
            <CtpTrozasPlanControles
              especies={especies}
              elegidas={elegidas}
              onEspecies={setElegidas}
              objetivo={objetivo}
              onObjetivo={setObjetivo}
              hayRendimiento={plan.rendimientoPct != null}
            />

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
              <p className="text-lg font-bold text-[var(--text-primary)]" aria-live="polite">
                Hoy: {resumenDelPlan(plan)}
              </p>
              <InfoTip
                title="Cómo se arma el plan"
                what="Entran sólo las trozas libres (ni apartadas, ni aserradas, ni de una guía que sigue en la bandeja), la que más días lleva parada primero, hasta cumplir la meta."
                affects={`Quitar una deja entrar a la siguiente de la fila; agregar suma por encima de la meta. ${
                  plan.rendimientoPct == null
                    ? "Sin corridas con entrada en el libro no hay rendimiento real, así que no se estiman pies tablares."
                    : `Los pies tablares son una estimación: m³ de troza × ${fmtPct(plan.rendimientoPct)} % (rendimiento real del libro) × 424.`
                } Al apartarlas en un lote, la corrida que lo toma las consume y salen solas del patio.`}
                example="Lunes 7 am: Tornillo, 6 piezas → «Hoy: 6 de Tornillo · ≈2,137 pt». Imprimes la hoja, el operario tacha las cortadas y apartas las 6 para la corrida."
              />
              {cambiosAMano > 0 && (
                <Btn
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    setQuitadas(new Set());
                    setAgregadas(new Set());
                  }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Deshacer {cambiosAMano} {cambiosAMano === 1 ? "cambio" : "cambios"} a mano
                </Btn>
              )}
            </div>

            {(plan.avisos.length > 0 || error) && (
              <ul className="space-y-1">
                {error && (
                  <li role="alert" className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
                    {error}
                  </li>
                )}
                {plan.avisos.map((a) => (
                  <li key={a} className="rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--text-primary)]">
                    {a}
                  </li>
                ))}
              </ul>
            )}

            <CtpTrozasPlanTabla
              plan={plan}
              onQuitar={(id) => {
                setAgregadas((s) => sinUna(s, id));
                setQuitadas((s) => new Set(s).add(id));
              }}
              onAgregar={(id) => {
                setQuitadas((s) => sinUna(s, id));
                setAgregadas((s) => new Set(s).add(id));
              }}
              onVerFicha={
                onVerFicha
                  ? (id) => {
                      onClose();
                      onVerFicha(id);
                    }
                  : undefined
              }
            />
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
