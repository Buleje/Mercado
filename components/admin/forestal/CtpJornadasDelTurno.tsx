"use client";

/**
 * Las jornadas del turno: de la medición al libro, en N corridas (ADR-373).
 *
 * Lo que se cubicó puede haberse aserrado en varios días. Registrarlo como una
 * sola corrida obligaría a inventar una fecha; registrarlo a mano, día por día,
 * es rehacer la misma cuenta cinco veces.
 *
 * Acá se ve el reparto **antes** de escribir —qué trozas, qué fecha y cuánto
 * declara cada jornada— y un botón lo registra. Cada troza cae en una sola
 * jornada: consumirla dos veces sería declarar dos veces la misma madera (T1).
 */

import { useMemo, useState } from "react";
import { CalendarDays, Loader2, PlusCircle } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import { armarJornadas } from "@/lib/forestal/consumo-en-jornadas";
import type { BloqueDistribuido } from "@/lib/forestal/cubicacion-reparto";
import type { ResumenJornadas } from "@/lib/forestal/registrar-jornadas";
import type { Jornada } from "@/lib/forestal/consumo-en-jornadas";
import { Btn } from "./ctp-shared";

const TONO_RESULTADO: Record<string, string> = {
  declarada: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  "corrida-abierta": "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  "no-consumio": "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
};

export default function CtpJornadasDelTurno({
  bloques,
  dias,
  fechaInicio,
  lote,
  ocupado,
  avance,
  onRegistrar,
}: {
  bloques: readonly BloqueDistribuido[];
  dias: number;
  fechaInicio: string;
  /** Sin lote elegido no hay dónde abrir la corrida: se dice, no se esconde. */
  lote: { id: string; code: string } | null;
  ocupado: boolean;
  avance: { hechas: number; total: number } | null;
  onRegistrar: (jornadas: Jornada[], loteId: string) => Promise<ResumenJornadas>;
}) {
  const [resumen, setResumen] = useState<ResumenJornadas | null>(null);
  const reparto = useMemo(() => armarJornadas(bloques, { dias, fechaInicio }), [bloques, dias, fechaInicio]);

  if (reparto.jornadas.length === 0) return null;

  return (
    <section className="space-y-2 rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--surface-sunken)] p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h4" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <CalendarDays className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          {reparto.jornadas.length === 1 ? "Una jornada" : `${reparto.jornadas.length} jornadas`} para el libro
        </CardTitle>
        <Btn
          variant="primary"
          disabled={!lote || ocupado}
          title={lote ? `Registra ${reparto.jornadas.length} corrida(s) en el lote ${lote.code}` : "Elegí un lote arriba para poder registrar"}
          onClick={async () => {
            if (!lote) return;
            setResumen(await onRegistrar(reparto.jornadas, lote.id));
          }}
        >
          {ocupado ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {avance ? `Registrando ${Math.min(avance.hechas + 1, avance.total)} de ${avance.total}…` : "Registrando…"}
            </>
          ) : (
            <>
              <PlusCircle className="h-4 w-4" /> Registrar {reparto.jornadas.length} corrida
              {reparto.jornadas.length === 1 ? "" : "s"}
            </>
          )}
        </Btn>
      </header>

      {!lote && (
        <p className="text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Elegí un lote en la tira de arriba: la corrida se abre dentro de un lote de aserrío.
        </p>
      )}
      {reparto.aviso && <p className="text-sm text-[var(--text-secondary)]">{reparto.aviso}</p>}

      <div className="overflow-x-auto">
        <DataTable className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              <th className="py-1 pr-2 font-bold">Día</th>
              <th className="py-1 pr-2 font-bold">Fecha</th>
              <th className="py-1 pr-2 font-bold">Trozas</th>
              <th className="py-1 pr-2 text-right font-bold">Rolliza</th>
              <th className="py-1 pr-2 text-right font-bold">Aserrada</th>
              <th className="py-1 text-right font-bold">Piezas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {reparto.jornadas.map((j) => (
              <tr key={j.dia}>
                <td className="py-1 pr-2 font-bold text-[var(--text-primary)]">{j.dia}</td>
                <td className="py-1 pr-2 font-mono tabular-nums text-[var(--text-secondary)]">{j.fecha}</td>
                <td className="py-1 pr-2 font-mono text-xs text-[var(--text-secondary)]">{j.etiquetas.join(", ")}</td>
                <td className="py-1 pr-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {Number(j.rollizaM3).toFixed(4)}
                </td>
                <td className="py-1 pr-2 text-right font-mono tabular-nums font-bold text-[var(--text-primary)]">
                  {Number(j.m3).toFixed(4)}
                </td>
                <td className="py-1 text-right font-mono tabular-nums text-[var(--text-secondary)]">{j.piezas}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      {resumen && (
        <div className="space-y-1 rounded-lg bg-[var(--surface-raised)] p-2">
          <p className="text-sm font-bold text-[var(--text-primary)]">{resumen.mensaje}</p>
          <ul className="space-y-0.5">
            {resumen.resultados.map((r) => (
              <li key={`${r.dia}-${r.fecha}`} className={`text-xs ${TONO_RESULTADO[r.estado] ?? ""}`}>
                Día {r.dia} ({r.fecha}):{" "}
                {r.estado === "declarada"
                  ? `declarada en la corrida N° ${r.lineNo}`
                  : r.estado === "corrida-abierta"
                    ? `la corrida N° ${r.lineNo} quedó abierta — ${r.detalle}`
                    : `no se registró — ${r.detalle}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
