"use client";

/**
 * Buscador de permisos para el import: escribe el código, el titular o el RUC
 * y elige. La última opción es siempre «+ Nuevo permiso», con lo escrito como
 * código: si no está en la lista, se crea ahí mismo.
 *
 * Mismo patrón que `CampoDelDirectorio`: flechas + Enter, `mousedown` para que
 * el blur no cierre la lista antes del clic, y Escape cierra SÓLO la lista
 * (el import vive en un `AdminModal`, que se cerraría entero).
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Search } from "@buleje/design-system/icons";
import { marcarMenuAbierto } from "@/components/admin/shared/action-menu";
import type { Contrato } from "@/lib/forestal/contratos";
import { CAMPO } from "./NuevoPermisoRapido";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function coincide(c: Contrato, q: string): boolean {
  if (!q) return true;
  const texto = sinTildes(
    [c.codigo, c.alias, c.titularNombre, c.titularDoc, c.resolucionNumero].filter(Boolean).join(" "),
  );
  return sinTildes(q).split(/\s+/).filter(Boolean).every((p) => texto.includes(p));
}

/** «código · titular · RUC 20…» — lo que identifica al permiso de un vistazo. */
export function rotuloDelPermiso(c: Contrato): string {
  return [c.codigo, c.titularNombre, c.titularDoc ? `${c.titularDocTipo ?? "RUC"} ${c.titularDoc}` : null]
    .filter(Boolean)
    .join(" · ");
}

export default function BuscarPermiso({
  contratos,
  cargando,
  elegido,
  etiqueta,
  deshabilitado,
  autoFoco,
  onElegir,
  onNuevo,
  onSalir,
}: {
  contratos: readonly Contrato[];
  cargando: boolean;
  elegido: string | null;
  etiqueta: string;
  deshabilitado?: boolean;
  autoFoco?: boolean;
  onElegir: (c: Contrato) => void;
  /** Abre el alta con lo escrito como código. */
  onNuevo: (codigo: string) => void;
  /** Se fue del buscador sin escribir nada. */
  onSalir?: () => void;
}) {
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(-1);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = useId();
  const visibles = useMemo(
    () => contratos.filter((c) => c.isActive !== false && coincide(c, q.trim())).slice(0, 8),
    [contratos, q],
  );
  /* La última opción es «Nuevo permiso»: cuenta para las flechas. */
  const total = visibles.length + 1;
  const mostrar = abierta && !deshabilitado;

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

  const elegirIndice = (i: number) => {
    setAbierta(false);
    setActiva(-1);
    if (i < visibles.length) onElegir(visibles[i]);
    else onNuevo(q.trim());
  };

  const onTecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierta(true);
      setActiva((i) => Math.min(i + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && mostrar && activa >= 0) {
      e.preventDefault();
      elegirIndice(activa);
    }
  };

  return (
    <div ref={caja} className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
      <input
        type="text"
        role="combobox"
        aria-label={etiqueta}
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={mostrar && activa >= 0 ? `${idLista}-${activa}` : undefined}
        autoComplete="off"
        autoFocus={autoFoco}
        disabled={deshabilitado}
        value={q}
        placeholder={cargando ? "Cargando tus permisos…" : "Elige el permiso: código, titular o RUC"}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierta(true);
          setActiva(-1);
        }}
        onFocus={() => setAbierta(true)}
        onBlur={() => {
          setAbierta(false);
          if (!q.trim()) onSalir?.();
        }}
        onKeyDown={onTecla}
        className={`${CAMPO} pl-10`}
      />
      {mostrar && (
        <ul
          id={idLista}
          role="listbox"
          aria-label={`${etiqueta} — tus permisos`}
          className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]"
        >
          {visibles.map((c, i) => (
            <li
              key={c.id}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={c.id === elegido}
              onMouseDown={(e) => {
                e.preventDefault();
                elegirIndice(i);
              }}
              onMouseEnter={() => setActiva(i)}
              className={`flex min-h-12 cursor-pointer items-center gap-2 px-3 py-1.5 ${i === activa ? "bg-[var(--surface-sunken)]" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{c.codigo}</span>
                <span className="block truncate text-xs text-[var(--text-tertiary)]">
                  {[c.titularNombre, c.titularDoc ? `RUC ${c.titularDoc}` : "sin RUC", c.resolucionNumero].filter(Boolean).join(" · ")}
                </span>
              </span>
              {c.id === elegido && <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />}
            </li>
          ))}
          {visibles.length === 0 && !cargando && (
            <li role="presentation" className="px-3 py-2 text-sm text-[var(--text-tertiary)]">
              {contratos.length === 0 ? "Todavía no tienes permisos cargados." : "Ninguno coincide."}
            </li>
          )}
          <li
            id={`${idLista}-${visibles.length}`}
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              elegirIndice(visibles.length);
            }}
            onMouseEnter={() => setActiva(visibles.length)}
            className={`flex min-h-12 cursor-pointer items-center gap-2 border-t border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--accent)] ${activa === visibles.length ? "bg-[var(--surface-sunken)]" : ""}`}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            {q.trim() ? `Nuevo permiso «${q.trim()}»` : "Nuevo permiso"}
          </li>
        </ul>
      )}
    </div>
  );
}
