"use client";

import { useId, useState } from "react";
import { Check, ScanBarcode } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { leerCostoEnCentimos, centimosDelCosto } from "@/lib/inventario/costo-en-fila";
import { leFalta } from "@/lib/inventario/catalogo-incompleto";
import { leerStockInicial, margenDe, type ProductoDeLista } from "@/lib/inventario/lista-para-vender";
import type { ListaParaVender } from "@/components/admin/inventario/hooks/use-lista-para-vender";

const CAMPO = "h-12 w-full min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
const BTN = button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl px-4 text-sm" });

function Falta({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold", ok ? "border-[var(--data-success-500)]/40 text-[var(--data-success-ink)]" : "border-[var(--data-warning-500)]/40 text-[var(--data-warning-ink)]")}>
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}{texto}
    </span>
  );
}

/** Costo del producto leído: escribe, Enter o «Guardar»; muestra el margen contra el precio de venta. */
function CostoRapido({ p, lista }: { p: ProductoDeLista & { costPrice?: number | string | null }; lista: ListaParaVender }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lectura = leerCostoEnCentimos(texto);
  const margen = lectura.ok ? margenDe(p.price, lectura.centimos) : null;
  const actual = centimosDelCosto(p.costPrice);
  const guardar = async () => {
    if (!lectura.ok) return setError(lectura.error);
    if (lectura.centimos == null) return setError("Escribe el costo, como 2.80");
    const fallo = await lista.guardarCosto(p.id, lectura.centimos);
    setError(fallo);
    if (!fallo) setTexto("");
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-secondary)]">
        Costo (S/){actual ? ` · hoy ${formatCurrency(actual / 100)}` : ""}
      </label>
      <div className="flex gap-2">
        <input id={id} inputMode="decimal" value={texto} placeholder="2.80" onChange={(e) => { setTexto(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardar(); } }} className={CAMPO} aria-invalid={error ? true : undefined} />
        <button type="button" onClick={() => void guardar()} className={BTN}>Guardar</button>
      </div>
      {margen != null && <p className="text-sm text-[var(--text-secondary)]">Margen contra tu precio de {formatCurrency(Number(p.price))}: <span className="font-bold tabular-nums">{margen} %</span></p>}
      {error && <p role="alert" className="text-sm text-[var(--data-error-ink)]">{error}</p>}
    </div>
  );
}

function StockRapido({ p, lista }: { p: ProductoDeLista; lista: ListaParaVender }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    const l = leerStockInicial(texto);
    if (!l.ok) return setError(l.error);
    const ok = await lista.activarControl(p.id, l.cantidad);
    if (ok) setTexto("");
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-secondary)]">Controlar stock: ¿cuántas unidades hay hoy?</label>
      <div className="flex gap-2">
        <input id={id} inputMode="numeric" value={texto} placeholder="12" onChange={(e) => { setTexto(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardar(); } }} className={CAMPO} aria-invalid={error ? true : undefined} />
        <button type="button" onClick={() => void guardar()} className={BTN}>Activar</button>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--data-error-ink)]">{error}</p>}
    </div>
  );
}

/** Lo que pasa tras leer un código: el producto y lo que le falta, o «¿Es este?» para asignarlo. */
export default function PanelLector({ lista }: { lista: ListaParaVender }) {
  const { lectura, producto, sugeridos, busqueda, setBusqueda, asignarCodigo, error, limpiar } = lista;
  const idBuscar = useId();
  if (!lectura) {
    return <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><ScanBarcode className="h-5 w-5 shrink-0" aria-hidden /> Pasa el lector por un producto de la góndola.</p>;
  }
  if (lectura.tipo === "existe" && producto) {
    const p = producto as ProductoDeLista;
    return (
      <div className="space-y-3" data-testid="lector-existe">
        <div>
          <p className="text-base font-bold text-[var(--text-primary)]">{p.name}</p>
          <p className="text-sm tabular-nums text-[var(--text-secondary)]">Código {lectura.codigo}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Falta ok={!leFalta(p, "sin-costo")} texto={leFalta(p, "sin-costo") ? "Falta el costo" : "Costo listo"} />
          <Falta ok={!leFalta(p, "sin-control")} texto={leFalta(p, "sin-control") ? "Sin control de stock" : `Stock ${p.stock}`} />
        </div>
        {leFalta(p, "sin-costo") && <CostoRapido p={p} lista={lista} />}
        {leFalta(p, "sin-control") && <StockRapido p={p} lista={lista} />}
        {error && <p role="alert" className="text-sm text-[var(--data-error-ink)]">{error}</p>}
        <button type="button" onClick={limpiar} className={button({ variant: "secondary", className: "w-full rounded-xl" })}>Listo, siguiente producto</button>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="lector-nuevo">
      <p className="text-base font-bold text-[var(--text-primary)]">Este código no está en tu catálogo</p>
      <p className="text-sm tabular-nums text-[var(--text-secondary)]">Código {lectura.codigo}. ¿Es alguno de estos, que aún no tiene código?</p>
      <label htmlFor={idBuscar} className="sr-only">Buscar por nombre</label>
      <input id={idBuscar} type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre" className={CAMPO} />
      {sugeridos.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Ningún producto sin código se llama así.</p>
      ) : (
        <ul className="space-y-2">
          {sugeridos.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 pl-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{s.name}</span>
              <button type="button" onClick={() => void asignarCodigo(s.id, lectura.codigo)} className={BTN} aria-label={`Es este: ${s.name}`}>Es este</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-[var(--data-error-ink)]">{error}</p>}
      <button type="button" onClick={limpiar} className={button({ variant: "ghost", className: "w-full rounded-xl" })}>No es ninguno, seguir</button>
    </div>
  );
}
