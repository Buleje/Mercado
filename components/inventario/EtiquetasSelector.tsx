"use client";

import { Search } from "lucide-react";
import { Casilla } from "@/components/ui-system/Casilla";
import QuantityStepper from "@/components/ui-system/QuantityStepper";
import { button } from "@/components/ui-system/button-variants";
import { CANTIDAD_MAX_POR_PRODUCTO, montoTexto } from "@/lib/etiquetas/precio";
import { VISIBLES_MAX, type EstadoEtiquetasPrecio } from "./use-etiquetas-precio";

const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";

/** Elegir productos: buscador, categoría, atajos («cambiaron hoy») y la lista con cantidades. */
export function EtiquetasSelector({ s }: { s: EstadoEtiquetasPrecio }) {
  const enCategoria = s.categoria ? s.productos.filter((p) => p.categoria === s.categoria).map((p) => p.id) : [];
  const atajos = [
    { id: "hoy", texto: "Cambiaron de precio hoy", ids: s.cambiadosHoy },
    { id: "semana", texto: "Esta semana", ids: s.cambiadosSemana },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <label className="relative block">
          <span className="sr-only">Buscar producto</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={s.busqueda}
            onChange={(ev) => s.setBusqueda(ev.target.value)}
            placeholder="Nombre, marca o código"
            className={`${CAMPO} pl-9`}
          />
        </label>
        <label className="block">
          <span className="sr-only">Categoría</span>
          <select value={s.categoria} onChange={(ev) => s.setCategoria(ev.target.value)} className={CAMPO}>
            <option value="">Todas las categorías</option>
            {s.categorias.map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre} ({c.n})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {s.categoria && (
          <button type="button" className={button({ variant: "secondary", size: "md" })} onClick={() => s.agregarVarios(enCategoria)}>
            Elegir los {enCategoria.length} de {s.categoria}
          </button>
        )}
        {atajos.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={a.ids.length === 0}
            className={button({ variant: "secondary", size: "md" })}
            onClick={() => s.agregarVarios(a.ids)}
          >
            {a.texto} ({a.ids.length})
          </button>
        ))}
        <Casilla
          etiqueta={`Solo los elegidos (${s.elegidos.size})`}
          checked={s.soloElegidos}
          onChange={(ev) => s.setSoloElegidos(ev.target.checked)}
        />
      </div>

      {s.filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
          {s.productos.length === 0 ? "Todavía no tienes productos para etiquetar." : "Ningún producto coincide con tu búsqueda."}
        </p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]">
          {s.visibles.map((p) => {
            const cantidad = s.elegidos.get(p.id);
            const codigo = p.barcode || p.sku;
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1">
                <Casilla
                  className="min-w-0 flex-1"
                  checked={cantidad != null}
                  onChange={() => s.alternar(p.id)}
                  etiqueta={
                    <span className="flex min-w-0 flex-col py-1">
                      <span className="truncate text-sm font-medium text-[var(--text-primary)]">{p.nombre}</span>
                      <span className="truncate text-xs text-[var(--text-secondary)]">
                        S/ {montoTexto(p.precio)} · {p.categoria} · {codigo ? codigo : "sin código"}
                      </span>
                    </span>
                  }
                />
                {cantidad != null && (
                  <QuantityStepper
                    value={cantidad}
                    onChange={(n) => s.fijarCantidad(p.id, n)}
                    min={1}
                    max={CANTIDAD_MAX_POR_PRODUCTO}
                    size="md"
                    label={`Etiquetas de ${p.nombre}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {s.filtrados.length > VISIBLES_MAX && (
        <p className="text-xs text-[var(--text-secondary)]">
          Ves {VISIBLES_MAX} de {s.filtrados.length}. Escribe en el buscador o elige una categoría para encontrar el resto.
        </p>
      )}
    </div>
  );
}
