"use client";

/**
 * El producto de una fila leída: las alternativas que propuso el servidor en
 * un select y, si ninguna es, «Buscar otro…» abre un buscador del catálogo.
 * El buscador se abre DESDE la ventana de revisión → `aboveModals`.
 */

import { useEffect, useId, useState } from "react";
import { Search, Package } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { logger } from "@/lib/logger";
import type { ProductoSugerido } from "@/lib/admin/comandos-ia/papel";
import { CAMPO, CAMPO_FALTA, soles } from "./formato";

const BUSCAR = "__buscar__";
const NINGUNO = "__ninguno__";

export function SelectorProducto({
  valor,
  alternativas,
  leido,
  onCambiar,
}: {
  valor: ProductoSugerido | null;
  alternativas: ProductoSugerido[];
  leido: string;
  onCambiar: (p: ProductoSugerido | null) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const opciones = valor && !alternativas.some((a) => a.id === valor.id) ? [valor, ...alternativas] : alternativas;
  const id = useId();

  return (
    <>
      <label htmlFor={id} className="sr-only">Producto de tu catálogo para «{leido}»</label>
      <select
        id={id}
        value={valor ? String(valor.id) : NINGUNO}
        onChange={(e) => {
          if (e.target.value === BUSCAR) { setBuscando(true); return; }
          onCambiar(opciones.find((o) => String(o.id) === e.target.value) ?? null);
        }}
        className={valor ? CAMPO : CAMPO_FALTA}
      >
        <option value={NINGUNO}>Elige el producto…</option>
        {opciones.map((o) => (
          <option key={o.id} value={String(o.id)}>{o.nombre}</option>
        ))}
        <option value={BUSCAR}>Buscar otro…</option>
      </select>
      {buscando && (
        <BuscadorProducto
          leido={leido}
          onCerrar={() => setBuscando(false)}
          onElegir={(p) => { onCambiar(p); setBuscando(false); }}
        />
      )}
    </>
  );
}

interface ProductoApi {
  id: number;
  name: string;
  stock?: number | null;
  costPrice?: number | null;
  unit?: string;
}

function BuscadorProducto({ leido, onCerrar, onElegir }: { leido: string; onCerrar: () => void; onElegir: (p: ProductoSugerido) => void }) {
  const [q, setQ] = useState(leido.split(/\s+/)[0] ?? "");
  const [lista, setLista] = useState<ProductoSugerido[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setError(null);
      fetch(`/api/v1/products?active=true&limit=20&q=${encodeURIComponent(q.trim())}`, { credentials: "include", signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: ProductoApi[]) => setLista(data.map((p) => ({
          id: p.id, nombre: p.name, stock: p.stock ?? null, costo: p.costPrice ?? null, unidad: p.unit ?? "", puntaje: 1,
        }))))
        .catch((err) => {
          if (ctl.signal.aborted) return;
          logger.warn("[comandos-ia/papel] buscar producto falló", { err: String(err) });
          setError("No pude buscar en tu catálogo.");
        });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  return (
    <AdminModal open onClose={onCerrar} title="Buscar producto" icon={Search} variant="centered-sm" aboveModals claveVentana="comandos-ia-papel-producto">
      <div className={`space-y-3 ${MODAL_BODY}`}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre del producto"
          aria-label="Buscar producto por nombre"
          className={CAMPO}
        />
        {error && <p role="alert" className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
        {lista === null && !error && <p className="text-sm text-[var(--text-tertiary)]">Buscando…</p>}
        {lista?.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Nada con ese nombre. Prueba con otra palabra.</p>}
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {lista?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onElegir(p)}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                <Package className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                <span className="shrink-0 tabular-nums text-xs text-[var(--text-tertiary)]">
                  {p.stock ?? "—"} {p.unidad} · {p.costo != null ? soles(p.costo) : "sin costo"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </AdminModal>
  );
}
