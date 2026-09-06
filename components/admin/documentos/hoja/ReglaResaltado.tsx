"use client";

/**
 * ReglaResaltado — "pintame de rojo todo lo que baje de 5".
 *
 * Revisar un inventario de 300 filas buscando lo que está por debajo del
 * mínimo se hacía a ojo, celda por celda. Acá se elige la regla, se ve cuántas
 * celdas caen ANTES de aplicar, y se pintan de una.
 *
 * Se dice sin vueltas que el color queda fijo (no es el formato condicional de
 * Excel, que se recalcula solo): promete lo que hace y se deshace con Ctrl+Z.
 */

import { useMemo, useState } from "react";
import { Check, Paintbrush, X } from "@buleje/design-system/icons";
import {
  celdasQueCumplen, COLORES_REGLA, describirRegla, type Comparador, type Regla,
} from "@/lib/documentos/hoja-reglas";
import type { CeldaHoja } from "@/lib/documentos/xlsx-formato";
import type { RangoNormal } from "@/lib/documentos/hoja-rango";

const COMPARADORES: { valor: Comparador; etiqueta: string; pideValor: boolean }[] = [
  { valor: "menor", etiqueta: "es menor que", pideValor: true },
  { valor: "mayor", etiqueta: "es mayor que", pideValor: true },
  { valor: "igual", etiqueta: "es igual a", pideValor: true },
  { valor: "contiene", etiqueta: "contiene el texto", pideValor: true },
  { valor: "vacia", etiqueta: "está vacía", pideValor: false },
];

export default function ReglaResaltado({
  filas, rango, etiquetaRango, onAplicar, onCerrar,
}: {
  filas: CeldaHoja[][];
  rango: RangoNormal;
  /** "B2:B40", para que se vea sobre qué se va a aplicar. */
  etiquetaRango: string;
  onAplicar: (celdas: { fila: number; columna: number }[], color: string) => void;
  onCerrar: () => void;
}) {
  const [comparador, setComparador] = useState<Comparador>("menor");
  const [valor, setValor] = useState("");
  const [color, setColor] = useState<string>(COLORES_REGLA[0].hex);

  const regla: Regla = useMemo(() => ({ comparador, valor }), [comparador, valor]);
  const coincidencias = useMemo(() => celdasQueCumplen(filas, rango, regla), [filas, rango, regla]);
  const pideValor = COMPARADORES.find((c) => c.valor === comparador)?.pideValor ?? true;
  const listo = coincidencias.length > 0 && (!pideValor || valor.trim() !== "");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[26rem] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--rule-base)] px-4 py-3">
          <Paintbrush className="h-4 w-4 text-[var(--accent)]" />
          <p className="flex-1 text-sm font-extrabold text-[var(--text-primary)]">Resaltar por regla</p>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-xs text-[var(--text-tertiary)]">
            En <strong className="text-[var(--text-secondary)]">{etiquetaRango}</strong>, pintar la celda si…
          </p>

          <div className="flex gap-2">
            <select
              value={comparador}
              onChange={(e) => setComparador(e.target.value as Comparador)}
              className="h-11 min-w-0 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-primary"
            >
              {COMPARADORES.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
            {pideValor && (
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={comparador === "contiene" ? "texto" : "5"}
                aria-label="Valor de la regla"
                className="h-11 w-28 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            {COLORES_REGLA.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                title={c.nombre}
                aria-label={`Color ${c.nombre}`}
                style={{ backgroundColor: c.hex }}
                className={`h-9 w-9 rounded-lg border-2 transition-transform ${
                  color === c.hex ? "scale-110 border-[var(--accent)]" : "border-[var(--rule-base)]"
                }`}
              >
                {color === c.hex && <Check className="mx-auto h-4 w-4 text-[#111827]" />}
              </button>
            ))}
          </div>

          <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            {coincidencias.length === 0
              ? <>Ninguna celda {describirRegla(regla)} en la selección.</>
              : <><strong className="text-[var(--text-primary)]">{coincidencias.length}</strong> celda{coincidencias.length === 1 ? "" : "s"} {describirRegla(regla)}.</>}
          </p>

          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            El color queda guardado en el archivo (se deshace con Ctrl+Z). Si después cambian los datos, volvé a aplicar la regla.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--rule-base)] px-4 py-3">
          <button onClick={onCerrar} className="rounded-xl px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button
            onClick={() => { onAplicar(coincidencias, color); onCerrar(); }}
            disabled={!listo}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            <Paintbrush className="h-4 w-4" /> Resaltar {coincidencias.length > 0 ? coincidencias.length : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
