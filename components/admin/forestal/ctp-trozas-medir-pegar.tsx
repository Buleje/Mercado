"use client";

/**
 * «Pegar desde Excel» de la planilla Anotar D1 y D2: el reparto (puro sobre el
 * estado de la planilla) y el cuadro donde se pega. No guarda nada: llena las
 * casillas vacías y el usuario mira la columna «Cuadra» antes de Guardar.
 */

import { useState } from "react";
import { ClipboardPaste } from "@buleje/design-system/icons";
import { leerMedidasPegadas } from "@/lib/forestal/pegar-medidas-trozas";
import { medidasDePieza } from "@/lib/forestal/trozas-patio-medidas";
import { Btn } from "./ctp-shared";
import type { ValoresMedida } from "./ctp-trozas-medir-fila";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

const plural = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

/** Reparte `texto` en las casillas vacías; devuelve los valores nuevos y la línea de resultado. */
export function repartirPegado(
  texto: string,
  piezas: readonly TrozaPatioAPI[],
  valores: Record<string, ValoresMedida>,
): { valores: Record<string, ValoresMedida>; resumen: string } {
  const r = leerMedidasPegadas(texto, piezas);
  const sig = { ...valores };
  let repartidas = 0;
  for (const t of piezas) {
    const m = r.asignadas.get(t.id);
    if (!m) continue;
    const ya = medidasDePieza(t);
    const act = sig[t.id] ?? { d1: "", d2: "" };
    const d1 = ya.d1 == null && act.d1.trim() === "" ? String(m.d1) : act.d1;
    const d2 = ya.d2 == null && act.d2.trim() === "" ? String(m.d2) : act.d2;
    if (d1 === act.d1 && d2 === act.d2) continue; // ya tenía dato en sus dos puntas
    sig[t.id] = { d1, d2 };
    repartidas += 1;
  }
  const partes = [plural(repartidas, "repartida", "repartidas")];
  if (r.sinPieza.length) partes.push(`${plural(r.sinPieza.length, "código sin pieza", "códigos sin pieza")}: ${r.sinPieza.slice(0, 6).join(", ")}${r.sinPieza.length > 6 ? "…" : ""}`);
  if (r.repetidos.length) partes.push(`${plural(r.repetidos.length, "repetido", "repetidos")}: ${r.repetidos.slice(0, 4).join(", ")}`);
  if (r.invalidas.length) partes.push(plural(r.invalidas.length, "inválida", "inválidas"));
  return { valores: sig, resumen: partes.join(" · ") };
}

export default function CtpTrozasMedirPegar({
  onRepartir, resultado,
}: {
  /** Devuelve la línea de resultado. */
  onRepartir: (texto: string) => void;
  resultado: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={() => setAbierto((v) => !v)}>
          <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Pegar desde Excel
        </Btn>
        {resultado && <span className="text-sm font-semibold text-[var(--text-primary)]" role="status">{resultado}</span>}
      </div>
      {abierto && (
        <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <label className="block text-sm text-[var(--text-secondary)]" htmlFor="medir-pegar-texto">
            Copia de tu hoja las columnas <b className="text-[var(--text-primary)]">código · D1 · D2</b> y pégalas aquí. Sólo se llenan las casillas vacías.
          </label>
          <textarea
            id="medir-pegar-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder={"62B\t76\t74\n63\t75,5\t70"}
            className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
          <div className="flex gap-2">
            <Btn variant="primary" disabled={texto.trim() === ""} onClick={() => { onRepartir(texto); setTexto(""); }}>Repartir</Btn>
            <Btn onClick={() => { setAbierto(false); setTexto(""); }}>Cerrar</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
