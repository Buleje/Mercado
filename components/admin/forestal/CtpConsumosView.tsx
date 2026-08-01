"use client";

/**
 * La Sección 2 del Libro de Operaciones —CONSUMOS— en pantalla.
 *
 * Era la única de las cuatro secciones del formato sin vista propia: existía en
 * el Excel oficial, pero para ver qué se consumió había que abrir corrida por
 * corrida. Un fiscalizador pregunta "¿qué madera entró a la sierra este mes?" y
 * eso tiene que responderse de una.
 *
 * Las filas las arma `filasConsumo()`, la MISMA que la hoja "2. Consumos" del
 * Excel: pantalla y libro presentado no pueden declarar consumos distintos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Flame, Loader2 } from "@buleje/design-system/icons";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { unidadOficial } from "@/lib/forestal/loctp-campos";
import {
  filasConsumo,
  type FilaConsumo,
  type GrafoConsumos,
  type IngresoConsumo,
} from "@/lib/forestal/loctp-consumos";
import { Celda, Cuadro, SinDatos, Texto, Th } from "./ctp-cuadro-shared";

const fmtFecha = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

export default function CtpConsumosView({ period }: { period: CtpPeriod }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaConsumo[]>([]);

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
      const [gra, ing] = await Promise.all([
        pedir<{ grafo?: GrafoConsumos }>(url("/api/admin/forestal/ctp", { grafo: "1" })),
        pedir<{ entries?: (IngresoConsumo & { status?: string })[] }>(
          url("/api/admin/forestal/wood-entries", { limit: "5000" }),
        ),
      ]);
      const ingresos = (ing.entries ?? []).filter((e) => e.status !== "anulado" && e.status !== "rechazado");
      setFilas(filasConsumo(gra.grafo ?? null, ingresos));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [period]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const total = useMemo(() => filas.reduce((a, f) => a + f.cantidad, 0), [filas]);
  const especies = useMemo(() => new Set(filas.map((f) => f.especieComun)).size, [filas]);
  const guias = useMemo(() => new Set(filas.map((f) => f.gtf)).size, [filas]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)] dark:bg-[var(--surface-raised)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Recorriendo la cadena de custodia del período…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>No se pudieron cargar los consumos: {error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-4 py-3 dark:bg-[var(--surface-raised)]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Flame className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {filas.length} consumo{filas.length === 1 ? "" : "s"} · {period.label}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {total.toFixed(4)} m³ de {especies} especie{especies === 1 ? "" : "s"} · {guias} guía
            {guias === 1 ? "" : "s"} de origen
          </p>
        </div>
      </div>

      <Cuadro
        titulo="Sección 2 · Consumos"
        subtitulo="11 casilleros. Un consumo no es un registro suelto: es la madera de una guía entrando a una corrida. El casillero (10) va vacío porque las trozas no tienen lote — los lotes se arman recién en producción."
      >
        <thead className="border-b-2 border-[var(--rule-base)]">
          <tr>
            <Th ancho="w-14">(1) N°</Th>
            <Th>(2) Fecha</Th>
            <Th>(3) Tipo de producto</Th>
            <Th>(4) N. común</Th>
            <Th>(5) N. científico</Th>
            <Th>(6) Cód. origen/CTP</Th>
            <Th>(7) N° fuente</Th>
            <Th>(8) Unidad</Th>
            <Th>(9) Cantidad</Th>
            <Th>(11) Observaciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-base)]">
          {filas.length === 0 ? (
            <SinDatos cols={10}>
              Sin consumos atribuidos en el período. Se registran al declarar de qué ingreso salió cada corrida
              de producción.
            </SinDatos>
          ) : (
            filas.map((f) => (
              <tr key={`${f.woodEntryId}-${f.corridaId}-${f.nro}`} className="hover:bg-[var(--surface-sunken)]">
                <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">{f.nro}</td>
                <Texto v={fmtFecha(f.fecha)} className="whitespace-nowrap" />
                <Texto v={f.tipoProducto} />
                <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{f.especieComun}</td>
                <Texto v={f.especieCientifica} className="italic" />
                <Texto v={f.codigoOrigen} className="font-mono" />
                <Texto v={f.fuenteOrigen} className="font-mono" />
                <Texto v={unidadOficial(f.unidad)} />
                <Celda v={f.cantidad} />
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                  <span className="font-mono font-bold text-[var(--text-primary)]">{f.gtf}</span> → {f.observaciones}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Cuadro>
    </div>
  );
}
