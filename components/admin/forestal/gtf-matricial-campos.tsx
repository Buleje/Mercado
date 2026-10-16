"use client";

/**
 * Bloque de la izquierda del talonario: todos los campos de la hoja agrupados
 * como en el papel, y al final las columnas de la tabla, con un buscador (por
 * nombre o por valor). La casilla dice si se imprime; un clic lo elige en la
 * hoja (Shift o Ctrl lo suma a los elegidos).
 *
 * Se desplaza solo, y cuando eliges un campo EN la hoja se corre hasta
 * mostrarlo: la lista y la hoja dicen lo mismo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, Search } from "@buleje/design-system/icons";
import { CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import { claveElemento } from "@/lib/forestal/gtf-matricial-edicion";
import { nombreCorto } from "@/lib/forestal/gtf-matricial-nombres";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";
import { BotonIcono } from "./gtf-matricial-controles";
import { SUBTITULO } from "./gtf-matricial-panel";

interface Fila {
  tipo: "campo" | "columna";
  id: string;
  label: string;
  buscar: string;
  visible: boolean;
  valor: string;
}

const plano = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function CamposTalonario({ t, s, onPlegar }: { t: EstadoGtfMatricial; s: SeleccionTalonario; onPlegar: () => void }) {
  const [q, setQ] = useState("");
  const lista = useRef<HTMLDivElement>(null);
  const hoja = t.hoja;
  const cat = CATALOGO[t.formato];
  const pagina = t.paginas[t.pagina];

  const todas = useMemo<Fila[]>(() => {
    if (!hoja) return [];
    const fila = (tipo: Fila["tipo"], id: string, label: string, visible: boolean, valor: string): Fila => ({
      tipo, id, label, visible, valor, buscar: plano(`${label} ${nombreCorto(t.formato, tipo, id)} ${valor}`),
    });
    return [
      ...cat.campos.map((c) => fila("campo", c.id, c.label, !!hoja.campos[c.id]?.visible, pagina?.campos[c.id] ?? "")),
      ...cat.columnas.map((c) => fila("columna", c.id, c.label, !!hoja.tabla.columnas[c.id]?.visible, pagina?.filas[0]?.[c.id] ?? "")),
    ];
  }, [hoja, cat, pagina, t.formato]);

  const grupos = useMemo(() => {
    const filtro = plano(q.trim());
    const porGrupo = new Map<string, Fila[]>();
    const grupoDe = new Map(cat.campos.map((c) => [c.id, c.grupo]));
    for (const f of todas) {
      if (filtro && !f.buscar.includes(filtro)) continue;
      const g = f.tipo === "columna" ? cat.tablaLabel : (grupoDe.get(f.id) ?? "");
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), f]);
    }
    return [...porGrupo.entries()];
  }, [todas, q, cat]);

  /* Elegido en la hoja → visible en la lista. Sólo mueve SU desplazamiento (a 400 px la lista no es un scroll propio). */
  const primero = s.elegidos[0];
  useEffect(() => {
    const c = lista.current;
    if (!c || !primero || c.scrollHeight <= c.clientHeight) return;
    const el = c.querySelector<HTMLElement>(`[data-clave="${CSS.escape(primero)}"]`);
    if (!el) return;
    const er = el.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    if (er.top < cr.top) c.scrollTop -= cr.top - er.top + 8;
    else if (er.bottom > cr.bottom) c.scrollTop += er.bottom - cr.bottom + 8;
  }, [primero]);

  if (!hoja) return null;
  const visibles = todas.filter((f) => f.visible).length;

  return (
    <section aria-label="Campos de la hoja" className="flex min-h-0 flex-col gap-2 lg:h-full">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 pl-1">
          <span className={`${SUBTITULO} block`}>Campos</span>
          <span className="block text-xs tabular-nums text-[var(--text-tertiary)]">
            {visibles} de {todas.length} se imprimen
          </span>
        </div>
        <span className="max-lg:hidden">
          <BotonIcono icon={PanelLeftClose} label="Plegar los campos" ayuda="La hoja gana ancho; se abre con la barrita de la izquierda." onClick={onPlegar} />
        </span>
      </div>
      <label className="relative block">
        <span className="sr-only">Buscar un campo</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar campo o valor"
          className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        />
      </label>
      <div ref={lista} className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-1">
        {grupos.length === 0 && <span className="px-1 text-sm text-[var(--text-tertiary)]">Ningún campo con «{q.trim()}».</span>}
        {grupos.map(([g, filas]) => (
          <div key={g} className="flex flex-col">
            <span className="sticky top-0 z-10 bg-[var(--surface-raised)] px-1 py-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              {g}
            </span>
            <ul className="flex flex-col">
              {filas.map((f) => {
                const k = claveElemento({ tipo: f.tipo, id: f.id });
                const elegido = s.elegidos.includes(k);
                return (
                  <li key={k} data-clave={k} className={`flex items-center gap-1.5 rounded-lg pl-1 ${elegido ? "bg-[var(--accent-muted)]" : ""}`}>
                    <input
                      type="checkbox"
                      aria-label={`Imprimir ${f.label}`}
                      title="Se imprime"
                      checked={f.visible}
                      onChange={(e) =>
                        f.tipo === "campo" ? t.cambiarCampo(f.id, { visible: e.target.checked }) : t.cambiarColumna(f.id, { visible: e.target.checked })
                      }
                      className="h-5 w-5 shrink-0 accent-[var(--accent-dark)]"
                    />
                    <button
                      type="button"
                      aria-pressed={elegido}
                      onClick={(e) => s.elegir(k, e.shiftKey || e.ctrlKey || e.metaKey)}
                      className={`flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg px-1.5 text-left leading-tight ${
                        elegido ? "" : "hover:bg-[var(--surface-sunken)]"
                      } ${f.visible ? "" : "opacity-60"}`}
                    >
                      <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{f.label}</span>
                      <span className="truncate font-mono text-xs text-[var(--text-tertiary)]">{f.valor || "vacío"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
