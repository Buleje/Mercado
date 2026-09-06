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
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import {
  derivarFuentes,
  filasRetrozado,
  type FilaRetrozado,
  type FuenteOrigen,
  type IngresoParaFuente,
  type RetrozoParaApartado,
} from "@/lib/forestal/loctp-apartados";
import { Celda, Cuadro, Entero, SinDatos, Texto, Th } from "./ctp-cuadro-shared";

const fmtFecha = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-PE", { timeZone: "UTC" }) : null;

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
      <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)] dark:bg-[var(--surface-raised)]">
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
      <Cuadro
        titulo="Apartado 1 · Fuente de origen o procedencia de la madera"
        subtitulo="7 casilleros. El N° de esta tabla es el que la Sección 1 declara en su casillero (5): sin este registro, ese número no referencia nada."
      >
        <thead className="border-b-2 border-[var(--rule-base)]">
          <tr>
            <Th ancho="w-14">(1) N°</Th>
            <Th>(2) Fuente</Th>
            <Th>(3) Titular</Th>
            <Th>(4) Cód. título</Th>
            <Th>(5) Resolución</Th>
            <Th>(6) RUC</Th>
            <Th>(7) Procedencia</Th>
            <Th>Guías</Th>
            <Th>m³</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-base)]">
          {fuentes.length === 0 ? (
            <SinDatos cols={9}>
              Ningún ingreso del período identifica su fuente. Falta el titular, el código del título o la
              resolución — se completan al traer la guía de SERFOR o a mano en el ingreso.
            </SinDatos>
          ) : (
            fuentes.map((f) => (
              <tr key={f.nro} className="hover:bg-[var(--surface-sunken)]">
                <td className="px-3 py-2 font-mono font-bold tabular-nums text-[var(--text-primary)]">{f.nro}</td>
                <Texto v={f.fuente} />
                <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">{f.titular || "—"}</td>
                <Texto v={f.codigoTitulo} className="font-mono" />
                <Texto v={f.resolucion} className="font-mono" />
                <Texto v={f.ruc} className="font-mono" />
                <Texto v={f.procedencia} />
                <Entero v={f.ingresos} />
                <Celda v={f.volumenM3} />
              </tr>
            ))
          )}
        </tbody>
      </Cuadro>

      <Cuadro
        titulo="Apartado 2 · Retrozado"
        subtitulo="11 casilleros. El seccionado de trozas dentro de la planta: de qué troza salió cada pedazo, con qué volumen entró y con cuál quedó."
      >
        <thead className="border-b-2 border-[var(--rule-base)]">
          <tr>
            <Th ancho="w-14">(1) N°</Th>
            <Th>(2) Fecha</Th>
            <Th>(3) Cód. origen/CTP</Th>
            <Th>(4) Vol. inicial</Th>
            <Th>(5) Cód. retrozado</Th>
            <Th>(6) N. común</Th>
            <Th>(7) N. científico</Th>
            <Th>(8) Ø mayor cm</Th>
            <Th>(9) Ø menor cm</Th>
            <Th>(10) Largo m</Th>
            <Th>(11) Vol. final</Th>
            <Th>Observaciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-base)]">
          {retrozos.length === 0 ? (
            <SinDatos cols={12}>
              Sin retrozado en el período. Se registra desde Trozas, cortando una troza en pedazos.
            </SinDatos>
          ) : (
            retrozos.map((r) => (
              <tr key={`${r.nro}-${r.codigoRetrozado}`} className="hover:bg-[var(--surface-sunken)]">
                <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">{r.nro}</td>
                <Texto v={fmtFecha(r.fecha)} className="whitespace-nowrap" />
                <Texto v={r.codigoOrigen} className="font-mono" />
                <Celda v={r.volumenInicial} />
                <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{r.codigoRetrozado}</td>
                <Texto v={r.nombreComun} />
                <Texto v={r.nombreCientifico} className="italic" />
                <Entero v={r.diametroMayorCm} />
                <Entero v={r.diametroMenorCm} />
                <Celda v={r.longitudM} />
                <Celda v={r.volumenFinal} />
                <td className="px-3 py-2 text-sm text-[var(--text-secondary)]">
                  {r.descarte && (
                    <span className="mr-1 rounded-md bg-[var(--data-warning-100)] px-1.5 py-0.5 font-bold text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
                      DESCARTE
                    </span>
                  )}
                  {r.observaciones || (r.descarte ? "" : "—")}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Cuadro>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1.5">
          <Trees className="h-4 w-4" aria-hidden /> {fuentes.length} fuente(s) de origen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Scissors className="h-4 w-4" aria-hidden /> {retrozos.length} pedazo(s) retrozados
          {descartado > 0 && ` · ${descartado} marcado(s) como descarte`}
        </span>
        <span>El descarte ocupa volumen de la troza madre pero no cuenta como producto disponible.</span>
      </p>
    </div>
  );
}
