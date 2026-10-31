"use client";

/**
 * Los dos APARTADOS del formato oficial del LO-CTP, en pantalla.
 *
 * - **Apartado 1 · Fuente de origen o procedencia de la madera.** El registro
 *   numerado al que apunta el casillero (5) de la Sección 1. Se deriva de la
 *   ficha oficial de SERFOR de cada guía del período: ahí consta el titular real
 *   de la concesión, el código del título y la resolución que aprueba el plan.
 * - **Apartado 2 · Retrozado.** Los cortes de patio del período (ADR-313), con
 *   la troza madre, su volumen inicial y el volumen de cada pedazo.
 *
 * El cálculo no vive acá: es el mismo `loctp-apartados.ts` puro que arma las dos
 * hojas del Excel oficial. Pantalla y Excel tienen que decir lo mismo.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Scissors, Trees } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import {
  derivarFuentes,
  filasRetrozado,
  type FilaRetrozado,
  type FuenteOrigen,
  type IngresoParaFuente,
  type RetrozoParaApartado,
} from "@/lib/forestal/loctp-apartados";
import { ApartadoFuentes, ApartadoRetrozado } from "./CtpApartadosTablas";

export default function CtpApartadosSerfor({ period }: { period: CtpPeriod }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fuentes, setFuentes] = useState<FuenteOrigen[]>([]);
  const [retrozos, setRetrozos] = useState<FilaRetrozado[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const url = (base: string, extra: Record<string, string> = {}) => {
        const u = new URL(base, window.location.origin);
        for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
        applyCtpPeriodParams(u.searchParams, period);
        return u.toString();
      };
      const pedir = async <T,>(u: string): Promise<T> => {
        const r = await fetch(u, { credentials: "include" });
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
        return (await r.json()) as T;
      };

      const [ing, ret] = await Promise.all([
        pedir<{ entries?: (IngresoParaFuente & { status?: string })[] }>(
          url("/api/admin/forestal/wood-entries", { limit: "5000" }),
        ),
        pedir<{ retrozos?: RetrozoParaApartado[] }>(url("/api/admin/forestal/trozas", { retrozos: "1" })),
      ]);

      // Anulados y rechazados no son parte del libro oficial.
      const ingresos = (ing.entries ?? []).filter((e) => e.status !== "anulado" && e.status !== "rechazado");
      setFuentes(derivarFuentes(ingresos).fuentes);
      setRetrozos(filasRetrozado(ret.retrozos ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [period]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-6 text-sm text-[var(--text-secondary)] ">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Armando los apartados del período…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>No se pudieron cargar los apartados: {error}</span>
      </div>
    );
  }

  const descartado = retrozos.filter((r) => r.descarte).length;

  return (
    <div className="space-y-4">
      <ApartadoFuentes fuentes={fuentes} />

      <ApartadoRetrozado retrozos={retrozos} />

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1.5">
          <Trees className="h-4 w-4" aria-hidden /> {fuentes.length} fuente(s) de origen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Scissors className="h-4 w-4" aria-hidden /> {retrozos.length} pedazo(s) retrozados
          {descartado > 0 && ` · ${descartado} marcado(s) como descarte`}
          <InfoTip
            icono="ayuda"
            title="Descarte"
            what="Ocupa volumen de la troza madre pero no cuenta como producto disponible."
          />
        </span>
      </p>
    </div>
  );
}
