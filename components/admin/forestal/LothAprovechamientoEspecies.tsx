"use client";

/**
 * El aprovechamiento por especie: las cinco con más saldo a la vista y el
 * resto plegado («Ver las N especies»). Cada fila dice su base, lo talado, lo
 * despachado, lo que le queda y el %; la que se pasó de su base va en rojo y
 * con cuánto se pasó.
 *
 * No es una tabla: en 400 px una tabla de seis columnas se corta. Es una lista
 * con las cifras rotuladas, que en pantalla ancha se alinea en columnas.
 */

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import type { Aprovechamiento, EspecieAprovechamiento } from "@/lib/forestal/loth-aprovechamiento";

const VISIBLES = 5;
const m3 = (v: number) => formatNumber(v, 3);
const COLS = "sm:grid sm:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_4.5rem] sm:items-center sm:gap-3";
const ROTULO = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

export default function LothAprovechamientoEspecies({ a }: { a: Aprovechamiento }) {
  const [todas, setTodas] = useState(false);
  if (a.especies.length === 0) return null;
  const lista = todas ? a.especies : a.especies.slice(0, VISIBLES);
  const ocultas = a.especies.length - VISIBLES;
  const base = a.modo === "plantacion" ? "Registrado" : "Autorizado";
  const saldo = a.modo === "plantacion" ? "En pie" : "Saldo";
  return (
    <div className="space-y-1.5">
      <div className={`hidden px-2 ${COLS} ${ROTULO}`} aria-hidden="true">
        <span>Especie</span>
        <span className="text-right">{base}</span>
        <span className="text-right">Talado</span>
        <span className="text-right">Despachado</span>
        <span className="text-right">{saldo}</span>
        <span className="text-right">%</span>
      </div>
      <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]" aria-label={`Aprovechamiento por especie, ordenado por ${saldo.toLowerCase()}`}>
        {lista.map((e) => <Fila key={e.especie} e={e} base={base} saldo={saldo} nombreBase={a.nombreBase} />)}
      </ul>
      {ocultas > 0 && (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          aria-expanded={todas}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 dark:text-[var(--accent)]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${todas ? "rotate-180" : ""}`} aria-hidden="true" />
          {todas ? "Ver sólo las 5 con más saldo" : `Ver las ${a.especies.length} especies`}
        </button>
      )}
    </div>
  );
}

function Fila({ e, base, saldo, nombreBase }: { e: EspecieAprovechamiento; base: string; saldo: string; nombreBase: string }) {
  const pasada = e.excesoM3 > 0;
  const rojo = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
  const ancho = e.pct == null ? (pasada ? 100 : 0) : Math.min(100, e.pct);
  return (
    <li data-especie={e.especie} className={`px-2 py-2 ${COLS} ${pasada ? "bg-[var(--data-error-500)]/6" : ""}`}>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 sm:block">
          <span className="truncate text-sm font-bold text-[var(--text-primary)]" title={e.especie}>{e.especie}</span>
          {/* En móvil el % va al lado del nombre; en ancho, en su columna. */}
          <span className={`font-mono text-sm font-bold tabular-nums sm:hidden ${pasada ? rojo : "text-[var(--text-primary)]"}`}>{pctTxt(e)}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden="true">
          <div className={`h-full rounded-full ${pasada ? "bg-[var(--data-error-500)]" : "bg-[var(--accent)]"}`} style={{ width: `${ancho}%` }} />
        </div>
        {pasada && (
          <span className={`mt-0.5 block text-xs font-semibold ${rojo}`}>
            {e.base > 0 ? `+${m3(e.excesoM3)} m³ sobre lo ${nombreBase}` : `sin m³ ${nombreBase}s: ${m3(e.excesoM3)} m³ de más`}
          </span>
        )}
      </div>
      <dl className="mt-1 grid grid-cols-4 gap-1 text-xs sm:contents">
        <Cifra rotulo={base} valor={m3(e.base)} />
        <Cifra rotulo="Talado" valor={m3(e.talado)} />
        <Cifra rotulo="Desp." valor={m3(e.despachado)} />
        <Cifra rotulo={saldo} valor={m3(e.saldo)} fuerte />
      </dl>
      <span className={`hidden text-right font-mono text-sm font-bold tabular-nums sm:block ${pasada ? rojo : "text-[var(--text-primary)]"}`}>{pctTxt(e)}</span>
    </li>
  );
}

const pctTxt = (e: EspecieAprovechamiento) => (e.pct == null ? "—" : `${formatNumber(e.pct, 0)} %`);

function Cifra({ rotulo, valor, fuerte = false }: { rotulo: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="min-w-0 sm:text-right">
      <dt className={`${ROTULO} sm:sr-only`}>{rotulo}</dt>
      <dd className={`truncate font-mono tabular-nums ${fuerte ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"} sm:text-sm`}>{valor}</dd>
    </div>
  );
}
