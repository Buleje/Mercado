"use client";

/**
 * Un campo de texto que busca en el Directorio mientras se escribe.
 *
 * Para los campos que nombran a alguien pero no son una parte de guía (sin
 * documento ni dirección que llenar): el comprador y el titular de un lote de
 * producción. Elegir de la lista entrega la FICHA —su id, para atar el dato por
 * id y no por cómo se escribió—; escribir uno que no está sigue permitido y
 * queda como texto, sin ficha.
 *
 * `CtpParteBarra` es la versión de las guías (llena nombre + documento +
 * dirección y trae de SUNAT); esto es lo mínimo para un nombre.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check } from "@buleje/design-system/icons";
import { marcarMenuAbierto } from "@/components/admin/shared/action-menu";
import { filtrarPartes, type Parte } from "@/lib/forestal/directorio";
import { I } from "./ctp-shared";

export default function CampoDelDirectorio({
  valor,
  parteId,
  opciones,
  onCambiar,
  etiqueta,
  placeholder,
}: {
  valor: string;
  /** La ficha elegida, o `null` si lo escrito no viene del Directorio. */
  parteId: string | null;
  /** Las fichas que se ofrecen, ya filtradas por papel y ordenadas por uso. */
  opciones: Parte[];
  onCambiar: (nombre: string, parte: Parte | null) => void;
  /** Nombre accesible del campo (el rótulo visible lo pone `Field`). */
  etiqueta: string;
  placeholder?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(-1);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = useId();
  // Con una ficha elegida el texto es su nombre: filtrar por él dejaría sólo a
  // ella. Se muestra la lista entera para poder cambiarla.
  const visibles = useMemo(
    () => filtrarPartes(opciones, parteId ? "" : valor).slice(0, 8),
    [opciones, parteId, valor],
  );
  const mostrar = abierta && visibles.length > 0;

  /* Escape con la lista abierta cierra SÓLO la lista: el formulario vive en un
     `AdminModal`, y Radix cierra el diálogo si el evento no llega con
     `defaultPrevented` (mismo patrón que `ActionMenu`). */
  useEffect(() => {
    if (!mostrar) return;
    const dialogo = caja.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    marcarMenuAbierto(dialogo, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setAbierta(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      marcarMenuAbierto(dialogo, false);
    };
  }, [mostrar]);

  function elegir(p: Parte) {
    onCambiar(p.nombre, p);
    setAbierta(false);
    setActiva(-1);
  }

  function onTecla(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierta(true);
      setActiva((i) => Math.min(i + 1, visibles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && mostrar && activa >= 0 && visibles[activa]) {
      e.preventDefault();
      elegir(visibles[activa]);
    }
  }

  return (
    <div ref={caja} className="relative">
      <input
        type="text"
        role="combobox"
        aria-label={etiqueta}
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={mostrar && activa >= 0 ? `${idLista}-${activa}` : undefined}
        autoComplete="off"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => {
          onCambiar(e.target.value, null);
          setAbierta(true);
          setActiva(-1);
        }}
        onFocus={() => setAbierta(true)}
        onBlur={() => setAbierta(false)}
        onKeyDown={onTecla}
        className={I}
      />
      {mostrar && (
        <ul
          id={idLista}
          role="listbox"
          aria-label={`${etiqueta} — Directorio`}
          className="absolute inset-x-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]"
        >
          {visibles.map((p, i) => (
            <li
              key={p.id}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={p.id === parteId}
              // `mousedown` y no `click`: el blur del input cierra la lista antes.
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(p);
              }}
              onMouseEnter={() => setActiva(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${i === activa ? "bg-[var(--surface-sunken)]" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{p.nombre}</span>
                {p.docNumero && (
                  <span className="block truncate font-mono text-xs text-[var(--text-tertiary)]">
                    {p.docTipo ?? "Doc"} {p.docNumero}
                  </span>
                )}
              </span>
              {p.id === parteId && <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
      {valor.trim() && (
        <p className="mt-1 text-xs text-[var(--text-tertiary)]" data-estado-directorio={parteId ? "ficha" : "texto"}>
          {parteId ? "Ficha del Directorio" : "No está en el Directorio: queda escrito así"}
        </p>
      )}
    </div>
  );
}
