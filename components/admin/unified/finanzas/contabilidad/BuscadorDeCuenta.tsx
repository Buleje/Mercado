"use client";

/**
 * Buscador de cuenta del plan: escribes el número o parte del nombre («caja»,
 * «1011», «sueldos») y eliges de la lista. Solo cuentas imputables y activas.
 * La lista se abre debajo del campo y empuja (no flota), para que no la corte
 * el scroll de la ventana.
 */
import { useId, useMemo, useState } from "react";
import type { CuentaPlan } from "@/lib/contabilidad/tipos";
import { CAMPO } from "./campos";

interface Props {
  cuentas: CuentaPlan[];
  valor: string;
  onElegir: (codigo: string) => void;
  etiqueta: string;
}

const TOPE = 8;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function BuscadorDeCuenta({ cuentas, valor, onElegir, etiqueta }: Props) {
  const [texto, setTexto] = useState<string | null>(null);
  const idLista = useId();
  const actual = cuentas.find((c) => c.codigo === valor);
  const mostrado = texto ?? (actual ? `${actual.codigo} · ${actual.nombre}` : "");

  const coincidencias = useMemo(() => {
    if (texto === null) return [];
    const q = sinTildes(texto.trim());
    const base = q ? cuentas.filter((c) => c.codigo.startsWith(q) || sinTildes(c.nombre).includes(q)) : cuentas;
    return base.slice(0, TOPE);
  }, [texto, cuentas]);

  return (
    <div>
      <input
        type="text"
        role="combobox"
        aria-label={etiqueta}
        aria-expanded={texto !== null}
        aria-controls={idLista}
        autoComplete="off"
        className={CAMPO}
        placeholder="Cuenta: número o nombre"
        value={mostrado}
        onFocus={(e) => { setTexto(""); e.currentTarget.select(); }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => setTimeout(() => setTexto(null), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && coincidencias.length > 0) { e.preventDefault(); onElegir(coincidencias[0].codigo); setTexto(null); }
          if (e.key === "Escape" && texto !== null) { e.stopPropagation(); setTexto(null); }
        }}
      />
      {texto !== null && (
        <ul id={idLista} role="listbox" className="mt-1 max-h-44 overflow-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {coincidencias.length === 0 && <li className="px-3 py-2 text-sm text-[var(--text-secondary)]">Ninguna cuenta coincide.</li>}
          {coincidencias.map((c) => (
            <li key={c.codigo} role="option" aria-selected={c.codigo === valor}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onElegir(c.codigo); setTexto(null); }}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                <span className="font-bold tabular-nums">{c.codigo}</span>
                <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
