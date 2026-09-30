"use client";

/**
 * Saldo por especie del permiso: de cada especie, lo que todavía se puede TALAR
 * (cupo − talado) y lo que todavía se puede MOVER (en patio).
 *
 * Una fila por especie con lo talado, lo trozado y a dónde fue cada m³
 * (despachado con GTF, consumido, en patio). El «saldo por talar» es la
 * columna que manda: número grande, barra de uso y el texto del veredicto (el
 * color solo no le dice nada a quien no distingue rojo de verde). Las especies
 * sin ninguna tala se pliegan en una línea con el cupo que siguen teniendo.
 *
 * Props puras: recibe el saldo ya calculado (`saldoPorEspecie`) o la entrada
 * cruda (censo + libro + autorizadas + planId) y lo calcula. Sin fetch.
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPct } from "@/lib/forestal/cubicacion-formato";
import { pctCorto } from "@/lib/forestal/loth-cupo-vista";
import {
  ordenarSaldo,
  saldoPorEspecie,
  type EntradaSaldo,
  type SaldoDelPlan,
  type SaldoEspecie,
} from "@/lib/forestal/loth-saldo-especie";
import { TONO_CUPO } from "./LothCupoEspecies";

export type LothSaldoEspeciesProps = (
  | { saldo: SaldoDelPlan; entrada?: never }
  | { entrada: EntradaSaldo; saldo?: never }
) & {
  /** Por defecto «Saldo por especie». */
  titulo?: string;
  className?: string;
};

const NUM = "whitespace-nowrap px-2 py-1.5 text-right font-mono text-xs tabular-nums";
const TH = "px-2 py-1.5 font-bold";

/** Un volumen; el cero se ve como raya para que lo que tiene dato salte a la vista. */
const vol = (v: number) => (v === 0 ? <span className="text-[var(--text-tertiary)]">—</span> : fmtM3(v));

function Saldo({ f }: { f: SaldoEspecie }) {
  if (f.saldoPorTalarM3 == null || f.pctUsado == null) {
    return <span className="text-xs font-semibold text-[var(--text-tertiary)]">{f.arbolesTalados > 0 ? "Talada sin cupo" : "Sin cupo"}</span>;
  }
  const ancho = Math.min(100, Math.max(0, f.pctUsado));
  const tono = TONO_CUPO[f.veredicto];
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`text-sm font-bold tabular-nums ${f.veredicto === "ok" ? "text-[var(--text-primary)]" : tono.texto}`}>
        {fmtM3(f.saldoPorTalarM3)}
        <span className="ml-0.5 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">m³</span>
      </span>
      <div className="flex items-center gap-1.5">
        <div
          className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(f.pctUsado)}
          aria-label={`${f.especie}: ${fmtPct(f.pctUsado)} % del cupo talado`}
        >
          <div className={`h-full rounded-full ${tono.barra}`} style={{ width: `${ancho}%` }} />
        </div>
        <span className={`text-[length:var(--ts-2xs)] font-semibold ${f.veredicto === "ok" ? "text-[var(--text-tertiary)]" : tono.texto}`}>
          {f.veredicto === "excedido" ? `Excedido · ${pctCorto(f.pctUsado)}` : pctCorto(f.pctUsado)}
        </span>
      </div>
    </div>
  );
}

function Fila({ f }: { f: SaldoEspecie }) {
  return (
    <tr
      data-veredicto={f.veredicto}
      className={`border-b border-[var(--rule-soft)] ${f.veredicto === "excedido" ? "bg-[var(--data-error-500)]/6" : ""}`}
    >
      <th scope="row" className="px-2 py-1.5 text-left font-semibold text-[var(--text-primary)]">{f.especie}</th>
      <td className={`${NUM} text-[var(--text-secondary)]`}>
        {f.cupoM3 == null ? "—" : fmtM3(f.cupoM3)}
        {f.fuente && (
          <span className="block font-sans text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            {f.fuente === "autorizado" ? "autorizado" : "del censo"}
          </span>
        )}
      </td>
      <td className={`${NUM} text-[var(--text-primary)]`}>{vol(f.taladoM3)}</td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>
        {vol(f.trozadoM3)}
        {f.trozasSinVolumen > 0 && (
          <span className="block font-sans text-[length:var(--ts-2xs)] text-[var(--data-warning-ink)]">{f.trozasSinVolumen} sin volumen</span>
        )}
      </td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>{vol(f.despachadoM3)}</td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>{vol(f.consumidoM3)}</td>
      <td className={`${NUM} ${f.enPatioM3 > 0 ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{vol(f.enPatioM3)}</td>
      <td className="px-2 py-1.5 text-right"><Saldo f={f} /></td>
    </tr>
  );
}

export default function LothSaldoEspecies(props: LothSaldoEspeciesProps) {
  const { saldo: dado, entrada, titulo = "Saldo por especie", className = "" } = props;
  const [abierto, setAbierto] = useState(false);
  const saldo = useMemo(() => dado ?? (entrada ? saldoPorEspecie(entrada) : null), [dado, entrada]);
  const filas = useMemo(() => ordenarSaldo(saldo?.filas ?? []), [saldo]);
  const conTala = filas.filter((f) => !f.sinTalar);
  const sinTalar = filas.filter((f) => f.sinTalar);
  const tot = saldo?.totales;

  return (
    <section className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 ${className}`} data-saldo-especies>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
          <InfoTip
            title={titulo}
            what="Por especie: el cupo (lo autorizado en el plan o, si no lo trae, lo censado), lo talado, lo trozado y a dónde fue: despachado con GTF, consumido o todavía en el patio. Saldo por talar = cupo − talado."
            affects="«Saldo por talar» es lo que el permiso todavía deja sacar del monte; «En patio» es lo que todavía se puede mover. Son dos saldos distintos. Una especie pasada del cupo sale en rojo y no le presta saldo a las demás."
            example="Tornillo: 320,000 autorizado − 9,537 talado = 310,463 por talar. Trozado 4,365: 2,850 despachado con la GTF 001-0045678 y 1,515 consumido."
          />
        </div>
        {tot && filas.length > 0 && (
          <p className="text-xs text-[var(--text-tertiary)]" aria-live="polite">
            <span className="font-semibold text-[var(--text-secondary)]">{fmtM3(tot.saldoPorTalarM3)} m³</span> por talar
            {" · "}
            <span className="font-semibold text-[var(--text-secondary)]">{fmtM3(tot.enPatioM3)} m³</span> en patio
            {tot.excesoM3 > 0 && <span className="font-bold text-[var(--data-error-ink)]"> · excedido +{fmtM3(tot.excesoM3)} m³</span>}
          </p>
        )}
      </div>

      {!saldo || filas.length === 0 ? (
        <p className="py-3 text-sm text-[var(--text-secondary)]">Sin censo ni especies autorizadas en este plan.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <th scope="col" className={`${TH} text-left`}>Especie</th>
                  <th scope="col" className={`${TH} text-right`}>Cupo</th>
                  <th scope="col" className={`${TH} text-right`}>Talado</th>
                  <th scope="col" className={`${TH} text-right`}>Trozado</th>
                  <th scope="col" className={`${TH} text-right`}>Despachado</th>
                  <th scope="col" className={`${TH} text-right`}>Consumido</th>
                  <th scope="col" className={`${TH} text-right`}>En patio</th>
                  <th scope="col" className={`${TH} text-right text-[var(--text-secondary)]`}>Saldo por talar</th>
                </tr>
              </thead>
              <tbody>
                {conTala.map((f) => <Fila key={f.clave} f={f} />)}
                {abierto && sinTalar.map((f) => <Fila key={f.clave} f={f} />)}
              </tbody>
              {tot && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold text-[var(--text-primary)]">
                    <th scope="row" className="px-2 py-1.5 text-left">Total</th>
                    <td className={NUM}>{fmtM3(tot.cupoM3)}</td>
                    <td className={NUM}>{fmtM3(tot.taladoM3)}</td>
                    <td className={NUM}>{fmtM3(tot.trozadoM3)}</td>
                    <td className={NUM}>{fmtM3(tot.despachadoM3)}</td>
                    <td className={NUM}>{fmtM3(tot.consumidoM3)}</td>
                    <td className={NUM}>{fmtM3(tot.enPatioM3)}</td>
                    <td className={`${NUM} text-sm`}>{fmtM3(tot.saldoPorTalarM3)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {sinTalar.length > 0 && tot && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              className="mt-1 inline-flex min-h-11 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
              data-sin-talar-toggle
            >
              <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} />
              <span>
                {sinTalar.length} {sinTalar.length === 1 ? "especie sin talar" : "especies sin talar"} · {fmtM3(tot.cupoSinTalarM3)} m³ de cupo intacto
              </span>
            </button>
          )}

          {saldo.fuera.n > 0 && (
            <p className="mt-1 px-2 text-xs text-[var(--data-warning-ink)]">
              {saldo.fuera.n} {saldo.fuera.n === 1 ? "troza" : "trozas"} ({fmtM3(saldo.fuera.m3)} m³) de árboles que no son de este plan: no suman a ninguna especie.
            </p>
          )}
          {saldo.sinTrozado > 0 && (
            <p className="mt-1 px-2 text-xs text-[var(--data-warning-ink)]">
              {saldo.sinTrozado} {saldo.sinTrozado === 1 ? "troza sale" : "trozas salen"} sin una línea de Trozado que la respalde: no suman.
            </p>
          )}
        </>
      )}
    </section>
  );
}
