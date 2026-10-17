"use client";

/**
 * FiltroColumnaTexto — el buscador DENTRO de la cabecera de una columna de
 * texto libre: documento, N° SNIFFS, origen… (Brandon, 2026-09-26: «en columna
 * documento ahí poner para buscar»).
 *
 * Va a la vista y no en un desplegable: en una columna de códigos no hay una
 * lista corta de valores que elegir, hay un número que se tipea. Espera
 * `espera` ms desde la última tecla antes de avisar — cada aviso puede ser una
 * consulta al servidor. Enter avisa ya; Escape borra.
 */

import { useEffect, useRef, useState } from "react";
import { Search, X } from "@buleje/design-system/icons";

export interface FiltroColumnaTextoProps {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  /** ms de calma antes de avisar. */
  espera?: number;
  className?: string;
}

export function FiltroColumnaTexto({
  label,
  value,
  onChange,
  placeholder = "Buscar",
  espera = 350,
  className = "",
}: FiltroColumnaTextoProps) {
  const [texto, setTexto] = useState(value ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisado = useRef(value ?? "");

  /* «Quitar los filtros» desde afuera tiene que vaciar también la caja. */
  useEffect(() => {
    if ((value ?? "") !== avisado.current) {
      avisado.current = value ?? "";
      setTexto(value ?? "");
    }
  }, [value]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const avisar = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    const limpio = v.trim();
    if (limpio === avisado.current) return;
    avisado.current = limpio;
    onChange(limpio);
  };
  const escribir = (v: string) => {
    setTexto(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => avisar(v), espera);
  };
  const activo = texto.trim() !== "";

  return (
    <div
      className={`mt-1.5 flex h-9 w-32 items-center gap-1 rounded-lg border-[1.5px] bg-[var(--surface-raised)] pl-2 pr-1 font-normal normal-case tracking-normal transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/30 ${
        activo ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"
      } ${className}`}
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <input
        type="search"
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") avisar(texto);
          if (e.key === "Escape" && activo) {
            e.preventDefault();
            setTexto("");
            avisar("");
          }
        }}
        onBlur={() => avisar(texto)}
        placeholder={placeholder}
        aria-label={`Buscar en ${label}`}
        className="h-full w-full min-w-0 bg-transparent! focus-visible:ring-0! focus-visible:ring-offset-0! text-sm font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] [&::-webkit-search-cancel-button]:hidden"
      />
      {activo && (
        <button
          type="button"
          onClick={() => {
            setTexto("");
            avisar("");
          }}
          aria-label={`Borrar la búsqueda en ${label}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
