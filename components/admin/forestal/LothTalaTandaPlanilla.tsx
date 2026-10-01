"use client";

/**
 * La planilla de «Talar varios árboles»: una fila por árbol, recorrida con el
 * teclado como en la libreta (flechas y Enter entre las medidas; ↓ baja al
 * mismo campo del árbol de abajo; Enter en la última medida va a guardar).
 */

import type { FormaMedicion } from "@/lib/forestal/loth-forma-medicion";
import type { CambioFila, ComunesTala, FilaCalculada, FilaTala } from "@/lib/forestal/loth-tala-tanda";
import { moverEntreMedidas } from "./navegar-medidas";
import LothTalaTandaDetalle from "./LothTalaTandaDetalle";
import LothTalaTandaFila, { camposDeTala, colsMedidasTala, FILA_TANDA } from "./LothTalaTandaFila";
import type { Motosierrista } from "./hooks/use-tala-en-tanda";

const CAB = "text-xs font-bold text-[var(--text-secondary)]";
const SPAN: Record<number, string> = { 1: "col-span-1", 2: "col-span-2" };

/** Las cabeceras consecutivas iguales se agrupan: «Ø mayor (m)» sobre sus dos medidas. */
function gruposDe(forma: FormaMedicion): { grupo: string; span: number }[] {
  const out: { grupo: string; span: number }[] = [];
  for (const c of camposDeTala(forma)) {
    const ult = out[out.length - 1];
    if (ult && ult.grupo === c.grupo) ult.span += 1;
    else out.push({ grupo: c.grupo, span: 1 });
  }
  return out;
}

export default function LothTalaTandaPlanilla({
  filas,
  calc,
  forma,
  comunes,
  abiertaDe,
  onAbrir,
  bloqueada,
  motosierristas,
  idLista,
  onEditar,
  onQuitar,
  alTerminar,
}: {
  filas: readonly FilaTala[];
  calc: readonly FilaCalculada[];
  forma: FormaMedicion;
  comunes: ComunesTala;
  abiertaDe: (f: FilaTala) => boolean;
  onAbrir: (id: string) => void;
  bloqueada: boolean;
  motosierristas: readonly Motosierrista[];
  idLista: string;
  onEditar: (id: string, cambio: CambioFila) => void;
  onQuitar: (id: string) => void;
  /** Enter en la última medida de la última fila. */
  alTerminar: () => boolean;
}) {
  return (
    <div onKeyDown={(e) => moverEntreMedidas(e, alTerminar)}>
      <p className="sr-only">Flechas y Enter te llevan de medida en medida; flecha abajo baja al mismo campo del árbol siguiente.</p>
      {/* Cabecera de columnas (≥ lg). Cada campo ya tiene su nombre: esto es para el ojo. */}
      <div aria-hidden="true" className={`hidden border-b border-[var(--rule-base)] px-1 pb-1.5 lg:grid ${FILA_TANDA}`}>
        <span className={CAB}>Árbol</span>
        <span className={CAB}>Fecha</span>
        <span className={`grid gap-1.5 ${colsMedidasTala(forma)}`}>
          {gruposDe(forma).map((g) => (
            <span key={g.grupo} className={`${SPAN[g.span] ?? ""} text-center ${CAB}`}>
              {g.grupo}
            </span>
          ))}
        </span>
        <span className={`text-right ${CAB}`}>Volumen · censo · pt</span>
        <span />
        <span />
      </div>
      <div className="space-y-2 lg:space-y-0">
        {filas.map((f, i) => (
          <LothTalaTandaFila
            key={f.id}
            fila={f}
            calc={calc[i]}
            forma={forma}
            comunes={comunes}
            abierta={abiertaDe(f)}
            bloqueada={bloqueada}
            onAbrir={() => onAbrir(f.id)}
            onEditar={(cambio) => onEditar(f.id, cambio)}
            onQuitar={filas.length > 1 ? () => onQuitar(f.id) : null}
          >
            <LothTalaTandaDetalle
              fila={f}
              comunes={comunes}
              motosierristas={motosierristas}
              idLista={idLista}
              bloqueada={bloqueada}
              onEditar={(cambio) => onEditar(f.id, cambio)}
            />
          </LothTalaTandaFila>
        ))}
      </div>
    </div>
  );
}
