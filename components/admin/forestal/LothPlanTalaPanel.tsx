"use client";

/**
 * LothPlanTalaPanel — la lista de árboles que cubre la meta de la zafra.
 *
 * El panel de zafra ya decía «vas atrasado, hacen falta 1.149 m³/día». Esto es
 * el paso siguiente: qué tumbar para lograrlo, con nombre y código, respetando
 * el saldo de cada especie. Se imprime y se va al monte con eso.
 *
 * Es una PROPUESTA, no un compromiso: no escribe nada en el libro. La tala se
 * registra cuando ocurre, con su fecha y su acta — un plan que se auto-declarara
 * ejecutado sería madera movilizada en el papel y en pie en el bosque.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Printer, TreePine } from "@buleje/design-system/icons";
import {
  metaDeDias,
  planDeTala,
  type ArbolParaTalar,
  type SaldoEspecie,
} from "@/lib/forestal/loth-plan-tala";

const n3 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export interface LothPlanTalaPanelProps {
  arboles: readonly ArbolParaTalar[];
  saldos: readonly SaldoEspecie[];
  /** m³/día que la zafra necesita para no perder saldo. */
  ritmoRequeridoM3Dia: number;
  /** Días que quedan de vigencia. */
  diasRestantes: number;
  /** Saldo total por movilizar: el plan nunca puede pedir más que esto. */
  saldoTotalM3: number;
  onImprimir?: (meta: number) => void;
}

/** Jornadas que se planifican de una vez. Una semana es lo que dura una cuadrilla. */
const OPCIONES_DIAS = [1, 7, 15, 30];

export default function LothPlanTalaPanel({
  arboles, saldos, ritmoRequeridoM3Dia, diasRestantes, saldoTotalM3, onImprimir,
}: LothPlanTalaPanelProps) {
  const [dias, setDias] = useState(7);

  const meta = useMemo(
    () => metaDeDias(ritmoRequeridoM3Dia, Math.min(dias, diasRestantes || dias), saldoTotalM3),
    [ritmoRequeridoM3Dia, dias, diasRestantes, saldoTotalM3],
  );
  const plan = useMemo(() => planDeTala(arboles, saldos, meta), [arboles, saldos, meta]);

  if (saldoTotalM3 <= 0) return null;

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <TreePine className="h-4 w-4 text-[var(--accent)]" /> Qué talar para no perder saldo
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Al ritmo que pide la zafra ({n3(ritmoRequeridoM3Dia)} m³/día), esto es lo que hay que tumbar. Es una propuesta:
            no registra nada hasta que la tala ocurra.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border-2 border-[var(--rule-base)] p-0.5">
            {OPCIONES_DIAS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDias(d)}
                aria-pressed={dias === d}
                className={`h-8 rounded px-2.5 text-xs font-bold transition-colors ${dias === d ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
              >
                {d === 1 ? "1 día" : `${d} días`}
              </button>
            ))}
          </div>
          {onImprimir && plan.lineas.length > 0 && (
            <button
              type="button"
              onClick={() => onImprimir(meta)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cifra label="Meta del período" valor={`${n3(meta)} m³`} nota={`${Math.min(dias, diasRestantes || dias)} ${dias === 1 ? "jornada" : "jornadas"}`} />
        <Cifra label="El plan suma" valor={`${n3(plan.totalM3)} m³`} nota={`${plan.lineas.length} ${plan.lineas.length === 1 ? "árbol" : "árboles"}`} tono={plan.faltanteM3 > 0 ? "warn" : "ok"} />
        <Cifra label="Árboles a tumbar" valor={String(plan.lineas.length)} nota="de mayor a menor volumen" />
        <Cifra label="Falta" valor={plan.faltanteM3 > 0 ? `${n3(plan.faltanteM3)} m³` : "—"} nota={plan.faltanteM3 > 0 ? "el bosque no da más" : "la meta se cubre"} tono={plan.faltanteM3 > 0 ? "warn" : "ok"} />
      </div>

      {plan.faltanteM3 > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 p-3 text-sm font-bold text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />
          {plan.motivoFaltante === "tope_por_especie" ? (
            <span>
              Faltan {n3(plan.faltanteM3)} m³ y hay árboles de sobra, pero no de las especies que todavía tienen saldo.
              La autorización es por especie: no se compensa con otra.
            </span>
          ) : (
            <span>
              Faltan {n3(plan.faltanteM3)} m³ y el censo no tiene más árboles aprovechables. O el censo está incompleto,
              o esta zafra no llega al volumen autorizado.
            </span>
          )}
        </p>
      )}

      {plan.lineas.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-5 text-center text-sm text-[var(--text-secondary)]">
          No hay árboles aprovechables para proponer. Revisá el censo, el DMC de cada especie y el saldo del plan.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-[var(--rule-base)]">
              <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
                <th className="px-2 py-2 w-8">#</th>
                <th className="px-2 py-2">Código</th>
                <th className="px-2 py-2">Especie</th>
                <th className="px-2 py-2 text-right">Volumen</th>
                <th className="px-2 py-2 text-right">Acumulado</th>
                <th className="px-2 py-2">Dónde</th>
              </tr>
            </thead>
            <tbody>
              {plan.lineas.map((l, i) => (
                <tr key={l.arbol.id} className="border-b border-[var(--rule-soft)] last:border-0">
                  <td className="px-2 py-1.5 font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">{i + 1}</td>
                  <td className="px-2 py-1.5 font-mono font-bold text-[var(--text-primary)]">{l.arbol.treeCode}</td>
                  <td className="px-2 py-1.5 text-[var(--text-secondary)]">{l.arbol.especie}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n3(l.arbol.volumenM3)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--text-secondary)]">{n3(l.acumuladoM3)}</td>
                  <td className="px-2 py-1.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                    {l.arbol.parcela && <span className="mr-1.5">{l.arbol.parcela}</span>}
                    {l.arbol.utmX != null && l.arbol.utmY != null
                      ? `${Math.round(l.arbol.utmX)} E · ${Math.round(l.arbol.utmY)} N`
                      : <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">sin GPS</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plan.descartes.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold text-[var(--text-secondary)]">
            {(() => {
              const n = plan.descartes.reduce((a, d) => a + d.arboles, 0);
              return `Por qué ${n === 1 ? "quedó afuera 1 árbol" : `quedaron afuera ${n} árboles`}`;
            })()}
          </summary>
          <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--text-secondary)]">
            {plan.descartes.map((d) => (
              <li key={`${d.especie}-${d.motivo}`}>
                <b className="text-[var(--text-primary)]">{d.especie}</b>: {d.arboles} {d.arboles === 1 ? "árbol" : "árboles"} ({n3(d.m3)} m³) — {d.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Cifra({ label, valor, nota, tono = "muted" }: {
  label: string; valor: string; nota: string; tono?: "ok" | "warn" | "muted";
}) {
  const color =
    tono === "ok" ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : tono === "warn" ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">{label}</p>
      <p className={`font-mono text-lg font-bold leading-tight tabular-nums ${color}`}>{valor}</p>
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{nota}</p>
    </div>
  );
}
