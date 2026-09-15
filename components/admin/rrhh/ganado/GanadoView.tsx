"use client";

/**
 * GanadoView — lo ganado de referencia por período (ADR-414 §5, sólo nivel
 * completo). El copy de referencia va SIEMPRE al lado del monto: esto no
 * calcula CTS, gratificaciones, EsSalud, ONP/AFP ni horas extra.
 *
 * Rango manual: si `desde > hasta` el servidor responde 422 (`rango_invalido`,
 * `rangoDeDias` da un arreglo vacío) y antes la UI mostraba el mismo error
 * genérico de red que cualquier otra falla. Ahora se valida ANTES de pedir:
 * el aviso sale en línea, junto a los campos, y el hook se queda con el
 * último rango válido — no se dispara el pedido que iba a fallar.
 */

import { Info } from "@buleje/design-system/icons";
import { useEffect, useMemo, useState } from "react";
import { DataTable, EmptyState, LoadingState, StatCard } from "@buleje/design-system";
import { Wallet } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { useRrhhGanado } from "@/hooks/use-rrhh-ganado";
import { diasDelMes, mesDe, semanaDe, sumarDias } from "@/lib/rrhh/fechas";
import { limaDateKey } from "@/lib/utils";
import { AvisoRrhh, CLASE_CAMPO, claseChipFiltro } from "../rrhh-form";
import { COPY_REFERENCIA, formatearFecha, formatearPEN } from "../rrhh-ui";
import FilaGanado from "./FilaGanado";

type Chip = "esta-semana" | "semana-pasada" | "este-mes" | "mes-pasado" | "rango";

function mesAnteriorDe(mesKey: string): string {
  const [y, m] = mesKey.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 2, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rangoDelMes(mesKey: string): { desde: string; hasta: string } {
  const desde = `${mesKey}-01`;
  return { desde, hasta: `${mesKey}-${String(diasDelMes(desde)).padStart(2, "0")}` };
}

export default function GanadoView() {
  const hoy = limaDateKey();
  const semanaActual = semanaDe(hoy);
  const semanaPasada = semanaDe(sumarDias(semanaActual.desde, -1));
  const mesActual = mesDe(hoy);

  const [chip, setChip] = useState<Chip>("este-mes");
  const [rangoManual, setRangoManual] = useState({ desde: rangoDelMes(mesActual).desde, hasta: hoy });

  const rangoCalculado = useMemo(() => {
    switch (chip) {
      case "esta-semana": return semanaActual;
      case "semana-pasada": return semanaPasada;
      case "este-mes": return rangoDelMes(mesActual);
      case "mes-pasado": return rangoDelMes(mesAnteriorDe(mesActual));
      case "rango": return rangoManual;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chip, rangoManual]);

  const rangoInvertido = chip === "rango" && rangoManual.desde > rangoManual.hasta;

  // Se congela el ÚLTIMO rango válido: mientras `rangoInvertido` sea true no
  // se lo pasamos al hook, así nunca se dispara el pedido que el servidor
  // rechazaría con 422.
  const [rangoAplicado, setRangoAplicado] = useState(rangoCalculado);
  useEffect(() => {
    if (!rangoInvertido) setRangoAplicado(rangoCalculado);
  }, [rangoCalculado, rangoInvertido]);

  const { desde, hasta } = rangoAplicado;
  const { ganado, loading, error, recargar } = useRrhhGanado(desde, hasta);

  const personasConAvisos = useMemo(() => {
    if (!ganado) return 0;
    return ganado.personas.filter((p) => p.avisos.length > 0 || p.sinMarcar.length > 0 || p.sinTarifa.length > 0).length;
  }, [ganado]);

  const CHIPS: { id: Chip; label: string }[] = [
    { id: "esta-semana", label: "Esta semana" },
    { id: "semana-pasada", label: "Semana pasada" },
    { id: "este-mes", label: "Este mes" },
    { id: "mes-pasado", label: "Mes pasado" },
    { id: "rango", label: "Rango" },
  ];

  return (
    <div className="space-y-4">
      <AvisoRrhh tono="info" icono={Info}>{COPY_REFERENCIA}</AvisoRrhh>

      <div role="group" aria-label="Filtrar por período" className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button key={c.id} type="button" aria-pressed={chip === c.id} onClick={() => setChip(c.id)} className={claseChipFiltro(chip === c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {chip === "rango" && (
        <div className="flex flex-wrap items-start gap-3">
          <Field label="Desde" className="w-40">
            {(id) => (
              <input
                id={id}
                type="date"
                value={rangoManual.desde}
                onChange={(e) => setRangoManual((r) => ({ ...r, desde: e.target.value }))}
                className={CLASE_CAMPO}
              />
            )}
          </Field>
          <Field label="Hasta" className="w-40">
            {(id) => (
              <input
                id={id}
                type="date"
                value={rangoManual.hasta}
                onChange={(e) => setRangoManual((r) => ({ ...r, hasta: e.target.value }))}
                className={CLASE_CAMPO}
              />
            )}
          </Field>
          {rangoInvertido && (
            <p role="alert" className="w-full text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              «Desde» no puede ser posterior a «Hasta» — corrige las fechas para ver el cálculo.
            </p>
          )}
        </div>
      )}

      <p className="text-sm text-[var(--text-secondary)]">
        Del <strong className="text-[var(--text-primary)]">{formatearFecha(desde)}</strong> al <strong className="text-[var(--text-primary)]">{formatearFecha(hasta)}</strong>
      </p>

      {loading && <LoadingState message="Calculando lo ganado..." />}
      {error && !loading && (
        <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error} <button type="button" onClick={recargar} className="ml-2 font-bold underline">Reintentar</button>
        </div>
      )}

      {ganado && !loading && (
        ganado.personas.length === 0 ? (
          <EmptyState icon={Wallet} title="Sin personal activo en este período" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <StatCard label="Total de referencia" value={formatearPEN(ganado.total)} density="compact" />
              <StatCard label="Personas" value={ganado.personas.length} density="compact" />
              <StatCard label="Con avisos" value={personasConAvisos} density="compact" emphasis={personasConAvisos > 0 ? "warning" : "neutral"} />
            </div>
            <DataTable zebra>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="text-right">Días pagados</th>
                  <th className="text-right">Horas</th>
                  <th>Tarifa</th>
                  <th className="text-right">Ganado (referencia)</th>
                  <th className="text-right">Adelantos abiertos</th>
                  <th>Avisos</th>
                </tr>
              </thead>
              <tbody>
                {ganado.personas.map((p) => <FilaGanado key={p.colaboradorId} persona={p} />)}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4} className="text-right">Total</th>
                  <th className="text-right tabular-nums">{formatearPEN(ganado.total)}</th>
                  <th colSpan={2} />
                </tr>
              </tfoot>
            </DataTable>
          </>
        )
      )}
    </div>
  );
}
