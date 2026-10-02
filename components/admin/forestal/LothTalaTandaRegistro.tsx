"use client";

/**
 * La tala en tanda de una PLANTACIÓN (ADR-459): agregar «Bolaina × N» a la
 * planilla y ver el saldo del registro bajando mientras se mide.
 *
 * Brandon (02-10): en una plantación sin censo la tanda no ofrecía nada —había
 * que registrar árbol por árbol—. Acá se elige la especie del registro y
 * cuántos árboles; la planilla los recibe con especie, científico y CITES
 * puestos y los códigos correlativos propuestos (001-BOL…).
 *
 * Pasarse de lo registrado NO frena (se mide con cinta y el registro es una
 * estimación): avisa en ámbar. Lo frena el libro al despachar (T6).
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Loader2, Minus, Plus, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { MAX_ARBOLES_POR_ESPECIE, type EspecieDelRegistro, type SaldoEnPlanilla } from "@/lib/forestal/loth-tala-plantacion";
import { CitesPill } from "./loth-plan-ui";

const AMBAR = "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";
const NUM = "font-mono tabular-nums";
const BTN_PASO =
  "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «− 3 +»: cuántos árboles de la especie. Se tipea o se toca. */
export function CantidadArboles({
  valor,
  onValor,
  especie,
  disabled = false,
}: {
  valor: number;
  onValor: (n: number) => void;
  /** Para el lector: «Cuántos árboles de Bolaina». */
  especie: string;
  disabled?: boolean;
}) {
  const fijar = (n: number) => onValor(Math.max(1, Math.min(MAX_ARBOLES_POR_ESPECIE, Math.floor(n) || 1)));
  return (
    <div role="group" aria-label={`Cuántos árboles de ${especie}`} className="inline-flex items-center gap-1">
      <button type="button" onClick={() => fijar(valor - 1)} disabled={disabled || valor <= 1} aria-label="Uno menos" className={BTN_PASO}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_ARBOLES_POR_ESPECIE}
        value={valor}
        disabled={disabled}
        onChange={(e) => fijar(Number(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`Árboles de ${especie}`}
        className={`h-10 w-14 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-center text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-70 sm:text-sm ${NUM}`}
      />
      <button
        type="button"
        onClick={() => fijar(valor + 1)}
        disabled={disabled || valor >= MAX_ARBOLES_POR_ESPECIE}
        aria-label="Uno más"
        className={BTN_PASO}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** «Bolaina · 3 árboles — 120,500 − 2,250 − 3,100 = quedan 115,150 m³». */
function SaldoDeEspecie({ s, cites }: { s: SaldoEnPlanilla; cites: boolean }) {
  const pasa = s.excesoM3 > 0;
  return (
    <li data-saldo-especie={s.especie} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-1.5">
        <b className="truncate text-[var(--text-primary)]">{s.especie}</b>
        {cites && <CitesPill />}
        <span className="text-xs text-[var(--text-secondary)]">
          {plural(s.arboles, "árbol", "árboles")}
          {s.sinVolumen > 0 && ` · ${s.sinVolumen} sin medir`}
        </span>
      </span>
      <span className={`${NUM} text-xs text-[var(--text-secondary)]`}>
        <span title="Registrado">{fmtM3(s.registradoM3)}</span> − <span title="Talado en el libro">{fmtM3(s.taladoM3)}</span> −{" "}
        <span title="Esta planilla">{fmtM3(s.estaTalaM3 ?? 0)}</span> ={" "}
        <b className={`whitespace-nowrap text-sm ${pasa ? AMBAR : "text-[var(--text-primary)]"}`}>
          {pasa ? `pasa por ${fmtM3(s.excesoM3)}` : `quedan ${fmtM3(s.quedaM3)}`} m³
        </b>
      </span>
    </li>
  );
}

export default function LothTalaTandaRegistro({
  especies,
  cargando,
  error,
  onReintentar,
  saldo,
  bloqueada,
  onAgregar,
}: {
  especies: readonly EspecieDelRegistro[];
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  /** `saldoDeLaPlanilla`: por especie que está en la planilla + las que no están en el registro. */
  saldo: { porEspecie: SaldoEnPlanilla[]; fuera: string[] };
  bloqueada: boolean;
  onAgregar: (e: EspecieDelRegistro, n: number) => void;
}) {
  const [clave, setClave] = useState<string>("");
  const [n, setN] = useState(1);
  const elegida = especies.find((e) => e.clave === clave) ?? especies[0] ?? null;
  const quedan = (e: EspecieDelRegistro) => saldo.porEspecie.find((s) => s.especie === e.especie)?.quedaM3 ?? e.enPieM3;

  return (
    <section aria-label="Registro de la plantación" className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex items-center gap-1">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Registro de la plantación
        </CardTitle>
        <InfoTip
          title="Registro de la plantación"
          what="Lo que talas en esta planilla se descuenta de lo registrado de cada especie: registrado − talado en el libro − la planilla."
          affects="Pasarse no frena la tala (se mide con cinta y el registro es una estimación): el libro lo frena al despachar."
          example="Bolaina 120,500 registrados y 2,250 talados; 3 árboles que suman 3,100 → quedan 115,150 m³."
        />
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leyendo el registro…
        </p>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <span className="min-w-0">{error}</span>
          <button type="button" onClick={onReintentar} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 font-semibold underline-offset-2 hover:underline">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : especies.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Este registro no tiene especies cargadas: agrégalas en Plan de manejo → Registro y saldo.</p>
      ) : (
        <>
          {saldo.porEspecie.length > 0 && (
            <ul className="divide-y divide-[var(--rule-soft)]">
              {saldo.porEspecie.map((s) => (
                <SaldoDeEspecie key={s.especie} s={s} cites={especies.find((e) => e.especie === s.especie)?.cites ?? false} />
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-0 flex-1 basis-56">
              <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Agregar por especie</span>
              <select
                value={elegida?.clave ?? ""}
                onChange={(e) => setClave(e.target.value)}
                disabled={bloqueada}
                className="h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-70"
              >
                {especies.map((e) => {
                  const q = quedan(e);
                  return (
                    <option key={e.clave} value={e.clave}>
                      {e.especie} — {q < 0 ? `pasa por ${fmtM3(-q)}` : `quedan ${fmtM3(q)}`} m³
                    </option>
                  );
                })}
              </select>
            </label>
            {elegida && (
              <>
                <CantidadArboles valor={n} onValor={setN} especie={elegida.especie} disabled={bloqueada} />
                <button
                  type="button"
                  onClick={() => onAgregar(elegida, n)}
                  disabled={bloqueada}
                  className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-[var(--accent)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />
                  Agregar {n === 1 ? "1 árbol" : `${n} árboles`}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {saldo.fuera.length > 0 && (
        <p role="note" className={`flex items-start gap-1.5 rounded-lg border border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 px-2.5 py-1.5 text-sm font-semibold ${AMBAR}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            {saldo.fuera.join(", ")} {saldo.fuera.length === 1 ? "no está" : "no están"} en el registro: el libro no {saldo.fuera.length === 1 ? "la" : "las"} acepta.
            Quítala de la planilla o agrégala en Plan de manejo → Registro y saldo.
          </span>
        </p>
      )}
    </section>
  );
}
