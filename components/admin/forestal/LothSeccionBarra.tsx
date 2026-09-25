"use client";

/**
 * LothSeccionBarra — la barra de trabajo de una sección del LO-TH.
 *
 * Misma regla que el resto de los libros (`admin/shared/action-menu`): lo que
 * se hace todos los días queda a la vista —buscar, filtrar, asentar una línea
 * nueva— y lo que se hace de vez en cuando entra a «Opciones» con su línea de
 * explicación. Antes «Etiquetas QR», «Importar», «CSV» y «Trozar árbol» eran
 * cuatro botones sueltos repartidos en dos filas, y el flotante de acciones
 * rápidas tapaba la mitad de «Etiquetas QR».
 *
 * «Nueva línea» vive acá y no en la cabina: la línea se asienta en la sección
 * que se está mirando, y en la cabina quedaba escondida dentro del panel de
 * Herramientas —la acción de todos los días, a dos clics y sin verse—.
 */

import type { Dispatch, SetStateAction } from "react";
import { Plus, Search } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { FiltroSeccion } from "@/lib/forestal/loth-seccion";

const CAMPO =
  "flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]";

export default function LothSeccionBarra({
  search,
  onSearch,
  onBuscar,
  filtro,
  setFiltro,
  periodos,
  especies,
  opciones,
  onNuevaLinea,
}: {
  search: string;
  onSearch: (v: string) => void;
  /** La búsqueda va al servidor: se dispara con Enter, no por tecla. */
  onBuscar: () => void;
  filtro: FiltroSeccion;
  setFiltro: Dispatch<SetStateAction<FiltroSeccion>>;
  periodos: { periodo: string; label: string; count: number }[];
  especies: string[];
  opciones: MenuAccion[];
  onNuevaLinea: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {/* Buscar + filtros: se envuelven entre ellos, nunca debajo de las
          acciones — así el CTA queda siempre en el mismo lugar. */}
      <div className="flex min-w-0 flex-1 basis-[28rem] flex-wrap items-center gap-2">
        <label className={`${CAMPO} min-w-0 flex-1 basis-[13rem] px-4 max-sm:basis-full`}>
          <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="sr-only">Buscar en la sección</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onBuscar()}
            placeholder="Código, especie o GTF"
            className="w-full min-w-0 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
        </label>
        <Filtro
          label="Período"
          value={filtro.periodo}
          onChange={(v) => setFiltro((f) => ({ ...f, periodo: v }))}
        >
          <option value="">Todos</option>
          {periodos.map((p) => (
            <option key={p.periodo} value={p.periodo}>
              {p.label} ({p.count})
            </option>
          ))}
        </Filtro>
        <Filtro
          label="Estado"
          value={filtro.estado}
          onChange={(v) => setFiltro((f) => ({ ...f, estado: v as FiltroSeccion["estado"] }))}
        >
          <option value="todas">Todas</option>
          <option value="registrado">Registradas</option>
          <option value="fuera_plazo">Fuera de plazo</option>
          <option value="corregidas">Corregidas</option>
          <option value="anulado">Anuladas</option>
        </Filtro>
        {especies.length > 1 && (
          <Filtro
            label="Especie"
            value={filtro.especie}
            onChange={(v) => setFiltro((f) => ({ ...f, especie: v }))}
          >
            <option value="">Todas</option>
            {especies.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </Filtro>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
        <ActionMenu
          label="Opciones"
          title="Importar, etiquetas QR y descargar"
          actions={opciones}
          size="md"
          compactoEnMovil
        />
        <button
          type="button"
          onClick={onNuevaLinea}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 max-sm:flex-1"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva línea
        </button>
      </div>
    </div>
  );
}

function Filtro({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={`${CAMPO} max-sm:min-w-[9rem] max-sm:flex-1`}>
      <span className="shrink-0 text-[var(--text-tertiary)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 max-w-[8rem] bg-transparent font-bold text-[var(--text-primary)] outline-none"
      >
        {children}
      </select>
    </label>
  );
}
