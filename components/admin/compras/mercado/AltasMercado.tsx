"use client";

import { useState } from "react";
import { Plus, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { CompetidorMercado } from "@/lib/compras/mercado";

const INPUT = "h-12 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]";
const ROTULO = "mb-1.5 text-sm font-semibold text-[var(--text-secondary)]";

interface Props {
  competidores: CompetidorMercado[];
  onCompetidor: (nombre: string) => boolean;
  onProducto: (nombre: string, miPrecio: number) => boolean;
  onQuitarCompetidor: (c: CompetidorMercado) => void;
}

/** Sumar competidores y productos a la lista (C38). Un nombre repetido no se agrega dos veces. */
export default function AltasMercado({ competidores, onCompetidor, onProducto, onQuitarCompetidor }: Props) {
  const [competidor, setCompetidor] = useState("");
  const [producto, setProducto] = useState("");
  const [miPrecio, setMiPrecio] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const sumarCompetidor = () => {
    if (!competidor.trim()) return;
    if (onCompetidor(competidor)) { setCompetidor(""); setAviso(null); }
    else setAviso(`«${competidor.trim()}» ya está en la lista.`);
  };
  const sumarProducto = () => {
    if (!producto.trim()) return;
    if (onProducto(producto, Number(miPrecio.replace(",", ".")) || 0)) { setProducto(""); setMiPrecio(""); setAviso(null); }
    else setAviso(`«${producto.trim()}» ya está en la lista.`);
  };

  return (
    <div className="space-y-2">
      <div className="grid gap-3 lg:grid-cols-2">
        <form onSubmit={(e) => { e.preventDefault(); sumarCompetidor(); }}>
          <p className={ROTULO}>Competidor</p>
          <div className="flex gap-2">
            <input value={competidor} onChange={(e) => setCompetidor(e.target.value)} maxLength={80} placeholder="Ej.: Bodega Pérez" aria-label="Nombre del competidor" className={`${INPUT} flex-1`} />
            <button type="submit" disabled={!competidor.trim()} className={button({ variant: "secondary", className: "rounded-xl" })}>
              <Plus className="h-4 w-4" aria-hidden /> Agregar
            </button>
          </div>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); sumarProducto(); }}>
          <p className={ROTULO}>Producto a comparar</p>
          <div className="flex gap-2">
            <input value={producto} onChange={(e) => setProducto(e.target.value)} maxLength={120} placeholder="Ej.: Arroz Costeño 5 kg" aria-label="Nombre del producto" className={`${INPUT} flex-1`} />
            <input value={miPrecio} onChange={(e) => setMiPrecio(e.target.value)} inputMode="decimal" placeholder="Tu precio" aria-label="Tu precio de venta" className={`${INPUT} w-28 tabular-nums`} />
            <button type="submit" disabled={!producto.trim()} className={button({ variant: "secondary", className: "rounded-xl" })}>
              <Plus className="h-4 w-4" aria-hidden /> Agregar
            </button>
          </div>
        </form>
      </div>
      {aviso && <p className="text-sm text-[var(--data-warning-ink)]" role="status">{aviso}</p>}
      {competidores.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Competidores">
          {competidores.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] py-1 pl-3 pr-1 text-sm font-medium text-[var(--text-secondary)]">
              {c.name}
              <button
                type="button"
                onClick={() => onQuitarCompetidor(c)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-ink)] dark:hover:bg-[var(--data-error-500)]/15"
                aria-label={`Quitar a ${c.name}`}
                title={`Quitar a ${c.name} y sus precios`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
