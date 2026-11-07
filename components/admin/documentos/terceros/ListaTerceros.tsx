"use client";

import { CardTitle } from "@buleje/design-system";
import { Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  TIPO_TERCERO_LABEL, agruparPorTipo, masUsados,
  type TerceroVinculado, type TipoTercero,
} from "@/lib/documentos/terceros-vinculo";
import { CAMPO_BUSCAR, ICONO_TERCERO } from "./compartido";

/** Con pocos terceros «Lo más usado» repetiría la lista entera. */
const MIN_PARA_MAS_USADOS = 6;

function FilaTercero({ t, activo, onElegir }: { t: TerceroVinculado; activo: boolean; onElegir: () => void }) {
  const Icono = ICONO_TERCERO[t.tipo];
  return (
    <li>
      <button
        type="button"
        onClick={onElegir}
        aria-current={activo ? "true" : undefined}
        data-qa="tercero-fila"
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
          activo
            ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--accent-muted)]"
            : "border-transparent hover:bg-[var(--surface-sunken)]",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)]">
          <Icono className="h-5 w-5 text-[var(--text-secondary)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{t.nombre}</span>
          <span className="block truncate text-xs text-[var(--text-tertiary)]">
            {t.docs === 1 ? "1 papel" : `${t.docs} papeles`}
            {" · "}
            {t.carpetas.length === 1 ? "1 carpeta" : `${t.carpetas.length} carpetas`}
            {t.detalle ? ` · ${t.detalle}` : ""}
          </span>
        </span>
        {t.vencidos > 0 ? (
          <span className="shrink-0 rounded-md bg-[var(--data-error-50)] px-1.5 py-0.5 text-xs font-bold text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15" title="Papeles vencidos">
            {t.vencidos} venc.
          </span>
        ) : t.porVencer > 0 ? (
          <span className="shrink-0 rounded-md bg-[var(--data-warning-50)] px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15" title="Vencen en 30 días o menos">
            {t.porVencer} por vencer
          </span>
        ) : null}
      </button>
    </li>
  );
}

export default function ListaTerceros({ todos, lista, q, setQ, tipo, setTipo, elegida, onElegir }: {
  /** Todos los terceros (para los contadores de los chips). */
  todos: readonly TerceroVinculado[];
  /** Los que pasan el buscador y el chip. */
  lista: readonly TerceroVinculado[];
  q: string;
  setQ: (q: string) => void;
  tipo: TipoTercero | null;
  setTipo: (t: TipoTercero | null) => void;
  elegida: string | null;
  onElegir: (clave: string) => void;
}) {
  const grupos = agruparPorTipo(todos);
  const frecuentes = !q.trim() && !tipo && todos.length >= MIN_PARA_MAS_USADOS ? masUsados(todos) : [];
  const chip = (activo: boolean) => cn(
    "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors",
    activo
      ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
  );
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar un tercero"
          placeholder="Buscar por nombre, DNI o RUC…"
          className={CAMPO_BUSCAR}
        />
      </div>
      {grupos.length > 1 && (
        <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!tipo} onClick={() => setTipo(null)} className={chip(!tipo)}>
            Todos <span className="tabular-nums opacity-70">{todos.length}</span>
          </button>
          {grupos.map((g) => (
            <button key={g.tipo} type="button" aria-pressed={tipo === g.tipo} onClick={() => setTipo(tipo === g.tipo ? null : g.tipo)} className={chip(tipo === g.tipo)}>
              {TIPO_TERCERO_LABEL[g.tipo].varios} <span className="tabular-nums opacity-70">{g.terceros.length}</span>
            </button>
          ))}
        </div>
      )}

      {frecuentes.length > 0 && (
        <section className="space-y-1">
          <CardTitle>Lo más usado</CardTitle>
          <ul className="space-y-1">
            {frecuentes.map((t) => <FilaTercero key={t.clave} t={t} activo={t.clave === elegida} onElegir={() => onElegir(t.clave)} />)}
          </ul>
        </section>
      )}

      {lista.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-[var(--text-tertiary)]">No encontré a nadie con «{q.trim()}».</p>
      ) : (
        agruparPorTipo(lista).map((g) => (
          <section key={g.tipo} className="space-y-1">
            <p className="flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              {TIPO_TERCERO_LABEL[g.tipo].varios}
              <span className="tabular-nums">{g.terceros.length}</span>
            </p>
            <ul className="space-y-1">
              {g.terceros.map((t) => <FilaTercero key={t.clave} t={t} activo={t.clave === elegida} onElegir={() => onElegir(t.clave)} />)}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
