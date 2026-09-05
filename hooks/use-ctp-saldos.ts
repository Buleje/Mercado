"use client";

/**
 * use-ctp-saldos — los tres pedidos que alimentan la pestaña Existencias.
 *
 * Saldos, conciliación y curva son tres lecturas del MISMO período y tienen que
 * llegar juntas: si la curva se actualiza y el KPI no, la pantalla muestra dos
 * saldos distintos y deja de ser creíble. Por eso viven en un solo hook con un
 * solo `recargar`, y no en tres `useEffect` repartidos por los componentes.
 *
 * Los tres van en paralelo. Conciliación y curva son SECUNDARIAS: si alguna
 * falla, la pantalla igual muestra los saldos —que es el dato que se declara—
 * en vez de quedarse en blanco por un gráfico.
 */
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import type { CurvaSaldoData } from "@/components/admin/forestal/saldos/CurvaDeSaldo";

const URL = "/api/admin/forestal/ctp";

export interface SpeciesBalance {
  especie: string;
  scientific: string | null;
  cites: boolean;
  ingresoM3: number;
  pendienteM3: number;
  consumidoM3: number;
  saldoM3: number;
  ingresosCount: number;
  /** Trozas de la especie que siguen en el patio y se pueden aserrar. */
  piezasDisponibles?: number;
}

export interface SaldosData {
  materiaPrima: {
    ingresoM3: number;
    ingresosCount: number;
    consumidoM3: number;
    saldoM3: number;
    pendienteM3: number;
    especiesEnNegativo: number;
  };
  porEspecie: SpeciesBalance[];
  productos: { producto: string; producido: number; despachado: number; stock: number }[];
}

export interface ConcilMP {
  especie: string;
  cites: boolean;
  apertura: number;
  ingreso: number;
  consumido: number;
  final: number;
  negativa: boolean;
}

export interface Concil {
  fuenteApertura: "cierre" | "calculada" | "sin_apertura";
  aperturaLabel: string | null;
  materiaPrima: ConcilMP[];
  productos: { producto: string; apertura: number; producido: number; despachado: number; final: number; negativo: boolean }[];
}

export interface CtpSaldosState {
  data: SaldosData | null;
  concil: Concil | null;
  curva: CurvaSaldoData | null;
  loading: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

/** Un GET del libro con el período aplicado. Devuelve `null` si el server no coopera. */
async function pedir<T>(params: Record<string, string>, period: CtpPeriod, campo: string): Promise<T | null> {
  const p = applyCtpPeriodParams(new URLSearchParams(params), period);
  const datos = await ctpGet<Record<string, T>>(`${URL}?${p}`).catch((err) => {
    /* Opcional a propósito —la conciliación y la curva adornan, no bloquean—
       pero el motivo se loguea: un `null` mudo es el que después nadie explica. */
    logger.warn("[ctp-saldos] dato opcional no cargó", { campo, error: String(err) });
    return null;
  });
  return datos?.[campo] ?? null;
}

export function useCtpSaldos(period: CtpPeriod): CtpSaldosState {
  const [data, setData] = useState<SaldosData | null>(null);
  const [concil, setConcil] = useState<Concil | null>(null);
  const [curva, setCurva] = useState<CurvaSaldoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [saldos, conciliacion, curvaSaldo] = await Promise.all([
        // Saldos es el único obligatorio: su error sí se muestra.
        (async () => {
          const p = applyCtpPeriodParams(new URLSearchParams({ saldos: "1" }), period);
          return (await ctpGet<{ saldos: SaldosData }>(`${URL}?${p}`)).saldos;
        })(),
        // La conciliación necesita un inicio de período: sin él no hay apertura
        // que conciliar y el endpoint devolvería una tabla de ceros.
        period.from ? pedir<Concil>({ conciliacion: "1" }, period, "conciliacion") : Promise.resolve(null),
        pedir<CurvaSaldoData>({ curva: "1" }, period, "curva"),
      ]);
      setData(saldos);
      setConcil(conciliacion);
      setCurva(curvaSaldo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { data, concil, curva, loading, error, recargar };
}
