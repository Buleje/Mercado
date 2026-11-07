"use client";

/**
 * Las filas de la tabla del talonario —la lista de trozas, o el cuadro (34) de
 * la guía— medidas con regla, en centímetros y milímetros (Brandon 16-10: «la
 * posición en cm y mm, por ejemplo 15 cm con 5 mm, de la primera fila y la
 * separación que va abajo»). Es lo mismo que «Y 1.ª fila» y «Alto fila» del
 * panel de una columna, pero a la vista y en la unidad de la regla; además
 * corre la tabla entera de costado (todas las columnas juntas).
 */

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { acotarPos, POS_MAX_MM, POS_MIN_MM } from "@/lib/forestal/gtf-matricial-disposicion";
import { I } from "./ctp-shared";
import { fmtMm, leerNumero } from "./gtf-matricial-controles";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";

const INPUT = I.replace("h-11", "h-12");

/** 155,5 mm → { cm: 15, mm: 5,5 }. */
export function enCmYMm(totalMm: number): { cm: number; mm: number } {
  const cm = Math.trunc(totalMm / 10);
  return { cm, mm: Math.round((totalMm - cm * 10) * 100) / 100 };
}

/** 155,5 → «15 cm 5,5 mm»; 150 → «15 cm». */
export function textoCmYMm(totalMm: number): string {
  const { cm, mm } = enCmYMm(totalMm);
  return mm ? `${cm} cm ${fmtMm(Math.abs(mm))} mm` : `${cm} cm`;
}

/** Dos cajas, cm y mm, que suman una medida en mm: «15» cm + «5» mm = 155 mm. */
export function CmYMm({
  label,
  value,
  onChange,
  min = POS_MIN_MM,
  max = POS_MAX_MM,
  qa,
}: {
  label: string;
  value: number;
  onChange: (mm: number) => void;
  min?: number;
  max?: number;
  qa?: string;
}) {
  const id = useId();
  const [cm, setCm] = useState(String(enCmYMm(value).cm));
  const [mm, setMm] = useState(fmtMm(enCmYMm(value).mm));
  useEffect(() => {
    setCm(String(enCmYMm(value).cm));
    setMm(fmtMm(enCmYMm(value).mm));
  }, [value]);

  const fijar = (total: number) => {
    const limpio = Math.min(max, Math.max(min, Math.round(total * 100) / 100));
    onChange(limpio);
    setCm(String(enCmYMm(limpio).cm));
    setMm(fmtMm(enCmYMm(limpio).mm));
  };
  const confirmar = () => fijar((leerNumero(cm) ?? 0) * 10 + (leerNumero(mm) ?? 0));
  const teclas = (pasoMm: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") confirmar();
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const base = (leerNumero(cm) ?? 0) * 10 + (leerNumero(mm) ?? 0);
      fijar(base + (e.key === "ArrowUp" ? 1 : -1) * pasoMm * (e.shiftKey ? 10 : 1));
    }
  };
  const caja = (valor: string, set: (v: string) => void, sufijo: "cm" | "mm", pasoMm: number) => (
    <span className="relative min-w-0">
      <input
        id={sufijo === "cm" ? id : undefined}
        inputMode="decimal"
        value={valor}
        aria-label={`${label}: ${sufijo === "cm" ? "centímetros" : "milímetros"}`}
        data-qa={qa ? `${qa}-${sufijo}` : undefined}
        onChange={(e) => set(e.target.value)}
        onBlur={confirmar}
        onKeyDown={teclas(pasoMm)}
        className={`${INPUT} pr-10 font-mono tabular-nums`}
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--text-tertiary)]">
        {sufijo}
      </span>
    </span>
  );
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <span className="font-mono text-xs font-normal tabular-nums text-[var(--text-tertiary)]">= {fmtMm(value)} mm</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {caja(cm, setCm, "cm", 10)}
        {caja(mm, setMm, "mm", 0.5)}
      </div>
    </div>
  );
}

/** El dato del renglón plegado: «1.ª fila 15 cm 5 mm · cada 4,2 mm». */
export function datoDeLasFilas(t: EstadoGtfMatricial): string {
  const tabla = t.hoja?.tabla;
  return tabla ? `1.ª fila ${textoCmYMm(tabla.y)} · cada ${fmtMm(tabla.altoFilaMm)} mm` : "";
}

export default function FilasDeLaTabla({ t }: { t: EstadoGtfMatricial }) {
  const hoja = t.hoja;
  if (!hoja) return null;
  const tabla = hoja.tabla;
  const columnas = Object.values(tabla.columnas);
  const izq = Math.min(...(columnas.some((c) => c.visible) ? columnas.filter((c) => c.visible) : columnas).map((c) => c.x));
  const ultima = tabla.y + (tabla.maxFilas - 1) * tabla.altoFilaMm;
  const correrDeCostado = (x: number) => {
    const d = x - izq;
    if (!d) return;
    t.cambiarHoja({
      tabla: { ...tabla, columnas: Object.fromEntries(Object.entries(tabla.columnas).map(([k, c]) => [k, { ...c, x: acotarPos(c.x + d) }])) },
    });
  };
  return (
    <div className="flex flex-col gap-2" data-qa="talonario-filas">
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        <span className="min-w-0 flex-1">Mídelo con regla desde el borde de la hoja.</span>
        <InfoTip
          title="Las filas con regla"
          what="La 1.ª fila se mide desde el borde de arriba de la hoja hasta la raya de arriba de la primera fila; la separación, de una raya a la siguiente. Escribe los centímetros en una caja y los milímetros en la otra."
          affects="Mueve las filas de la tabla en pantalla y al imprimir; el corrimiento de la impresora (Calibrar) se suma aparte."
          example="15 cm con 5 mm = 155 mm desde arriba · separación 0 cm con 8,5 mm"
        />
      </span>
      <CmYMm label="1.ª fila · desde arriba" value={tabla.y} onChange={(y) => t.cambiarTabla({ y })} qa="filas-y" />
      <CmYMm label="Separación entre filas" value={tabla.altoFilaMm} min={2} max={60} onChange={(altoFilaMm) => t.cambiarTabla({ altoFilaMm })} qa="filas-alto" />
      <CmYMm label="1.ª columna · izquierda" value={izq} onChange={correrDeCostado} qa="filas-x" />
      <span className="text-xs tabular-nums text-[var(--text-tertiary)]" data-qa="filas-ultima">
        La fila {tabla.maxFilas} cae a {textoCmYMm(ultima)} desde arriba.
      </span>
    </div>
  );
}
