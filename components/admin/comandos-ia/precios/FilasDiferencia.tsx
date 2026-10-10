"use client";

import { useEffect, useRef } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/currency";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "../papel/formato";
import { MARGEN_MINIMO, margen, type FilaDiferencia } from "@/lib/admin/comandos-ia/precios";

/** Botones de la sección (mismo alto/radio que el Btn del panel). */
// Botones: el canon de toda la pestaña (papel/formato.ts) + lo propio de precios.
const EXTRA = "whitespace-nowrap aria-disabled:cursor-wait aria-disabled:opacity-60";
export const BTN = {
  primario: `${BOTON_PRIMARIO} ${EXTRA}`,
  secundario: `${BOTON_SECUNDARIO} ${EXTRA}`,
};

/** «24,90» o «24.90» → 24.9; vacío o inválido → null. */
export function leerPrecio(texto: string | undefined): number | null {
  if (texto == null || texto.trim() === "") return null;
  const n = Number(texto.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const pct = (m: number | null) => (m == null ? "—" : `${(m * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })} %`);

export interface PropsFilas {
  filas: FilaDiferencia[];
  marcadas: Set<number>;
  onMarcar: (productId: number, marcada: boolean) => void;
  /** Marca o desmarca todas las que se pueden cambiar (las excluidas no). */
  onMarcarTodas: (marcar: boolean) => void;
  precios: Record<number, string>;
  onPrecio: (productId: number, texto: string) => void;
  /** Filas que cambiaron desde la vista previa (409): su «Hoy» ya es el nuevo. */
  cambiadas: Set<number>;
}

/** Lo que queda de verdad en la fila: el precio editado manda sobre el calculado. */
export function precioFinal(f: FilaDiferencia, precios: Record<number, string>): number {
  return leerPrecio(precios[f.productId]) ?? f.precioNuevo;
}

function Avisos({ f, bajo, cambio }: { f: FilaDiferencia; bajo: boolean; cambio: boolean }) {
  const chip = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold";
  if (!cambio && !f.aviso && !bajo) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {cambio && <span className={`${chip} bg-[var(--surface-raised)] text-[var(--data-error-700)] ring-1 ring-inset ring-[var(--data-error-500)]/40 dark:text-[var(--data-error-500)]`}>cambió: revísalo</span>}
      {f.aviso === "excluido" && <span className={`${chip} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`}>excluido por tu orden</span>}
      {f.aviso === "sin-costo" && <span className={`${chip} bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--surface-sunken)] dark:text-[var(--data-warning-500)]`}>sin costo</span>}
      {bajo && f.aviso !== "excluido" && <span className={`${chip} bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--surface-sunken)] dark:text-[var(--data-warning-500)]`}>margen bajo 15 %</span>}
    </span>
  );
}

function Hoy({ f }: { f: FilaDiferencia }) {
  const costoCambia = f.costoNuevo != null && f.costoNuevo !== f.costoHoy;
  return (
    <span className="block tabular-nums">
      <span className="block text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(f.precioHoy)}</span>
      <span className="block whitespace-nowrap text-xs text-[var(--text-tertiary)]">
        costo {f.costoHoy == null ? "—" : formatCurrency(f.costoHoy)}
        {/* Sin repetir «S/»: la columna gana ancho y el nombre del producto no se parte. */}
        {costoCambia && <span className="font-semibold text-[var(--text-secondary)]"> → {Number(f.costoNuevo).toFixed(2)}</span>}
      </span>
    </span>
  );
}

function Queda({ f, valor, onPrecio }: { f: FilaDiferencia; valor: string | undefined; onPrecio: PropsFilas["onPrecio"] }) {
  if (f.aviso === "excluido") {
    return <span className="text-sm tabular-nums text-[var(--text-tertiary)] line-through">{formatCurrency(f.precioHoy)}</span>;
  }
  return (
    <label className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 focus-within:ring-2 focus-within:ring-[var(--accent)]/40">
      <span className="text-xs text-[var(--text-tertiary)]">S/</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Precio nuevo de ${f.nombre}`}
        value={valor ?? Number(f.precioNuevo).toFixed(2)}
        onChange={(e) => onPrecio(f.productId, e.target.value)}
        className="h-9 w-20 bg-transparent text-right text-sm font-bold tabular-nums text-[var(--text-primary)] focus:outline-none"
      />
    </label>
  );
}

function Margen({ f, precio }: { f: FilaDiferencia; precio: number }) {
  const nuevo = f.aviso === "excluido" ? f.margenHoy : margen(precio, f.costoNuevo);
  const bajo = nuevo != null && nuevo < MARGEN_MINIMO;
  return (
    <span className="text-sm tabular-nums whitespace-nowrap">
      <span className="text-[var(--text-secondary)]">{pct(f.margenHoy)}</span>
      <span className="text-[var(--text-tertiary)]"> → </span>
      <span className={bajo ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "font-semibold text-[var(--text-primary)]"}>{pct(nuevo)}</span>
    </span>
  );
}

/** Casilla «todas»: marcada si están todas, a medias si hay algunas. */
function CasillaTodas({ total, marcadas, onMarcarTodas }: { total: number; marcadas: number; onMarcarTodas: PropsFilas["onMarcarTodas"] }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = marcadas > 0 && marcadas < total;
  }, [marcadas, total]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={marcadas === total ? "Desmarcar todas" : "Marcar todas"}
      checked={total > 0 && marcadas === total}
      disabled={total === 0}
      onChange={(e) => onMarcarTodas(e.target.checked)}
      className="h-5 w-5 shrink-0 accent-[var(--accent-dark)] disabled:opacity-40"
    />
  );
}

const Casilla = ({ f, marcada, onMarcar }: { f: FilaDiferencia; marcada: boolean; onMarcar: PropsFilas["onMarcar"] }) => (
  <input
    type="checkbox"
    aria-label={`Cambiar ${f.nombre}`}
    checked={marcada}
    disabled={f.aviso === "excluido"}
    onChange={(e) => onMarcar(f.productId, e.target.checked)}
    className="h-5 w-5 shrink-0 accent-[var(--accent-dark)] disabled:opacity-40"
  />
);

/** Producto | Hoy | Queda | Margen hoy→queda. A 400 px la tabla pasa a tarjetas. */
export default function FilasDiferencia({ filas, marcadas, onMarcar, onMarcarTodas, precios, onPrecio, cambiadas }: PropsFilas) {
  const bajoDe = (f: FilaDiferencia) => {
    const m = margen(precioFinal(f, precios), f.costoNuevo);
    return m != null && m < MARGEN_MINIMO;
  };
  const marcables = filas.filter((f) => f.aviso !== "excluido");
  const todas = { total: marcables.length, marcadas: marcables.filter((f) => marcadas.has(f.productId)).length, onMarcarTodas };
  // border-separate + borde en cada celda: con border-collapse la raya del thead
  // pegajoso se quedaba atrás al bajar.
  const celda = "border-b px-2 py-2";
  const th = `${celda} border-[var(--rule-base)] bg-[var(--surface-raised)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]`;
  const td = `${celda} border-[var(--rule-soft)] align-top`;
  // Las cifras a la derecha: se comparan de arriba abajo sin buscar la coma.
  const thNum = `${th} text-right`;
  const fondoFila = (id: number) => (cambiadas.has(id) ? "bg-[var(--data-error-500)]/10" : undefined);

  return (
    <>
      <table className="hidden w-full border-separate border-spacing-0 sm:table">
        {/* Cabecera pegada arriba al bajar por una categoría larga. */}
        <thead className="sticky top-0 z-[1]">
          <tr>
            <th className={`${th} w-8`}><CasillaTodas {...todas} /></th>
            <th className={th}>Producto</th>
            <th className={thNum}>
              <span className="inline-flex items-center gap-1">Hoy <InfoTip title="Hoy" what="Precio y costo que tiene hoy en tu catálogo." example="S/ 24.90 · costo S/ 18.29" /></span>
            </th>
            <th className={thNum}>
              <span className="inline-flex items-center gap-1">Queda <InfoTip title="Queda" what="El precio nuevo, ya redondeado. Puedes corregirlo aquí antes de aplicar." affects="Solo cambian las filas marcadas." example="26.97 → con «10 céntimos» queda 27.00" /></span>
            </th>
            <th className={thNum}>
              <span className="inline-flex items-center gap-1">Margen <InfoTip title="Margen hoy → queda" what="(precio − costo) ÷ precio. En rojo si queda bajo 15 %." example="(24.90 − 18.00) ÷ 24.90 = 27.7 %" /></span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.productId} className={fondoFila(f.productId)}>
              <td className={td}><Casilla f={f} marcada={marcadas.has(f.productId)} onMarcar={onMarcar} /></td>
              <td className={td}>
                <span className={`block text-sm font-medium text-[var(--text-primary)] [overflow-wrap:anywhere] ${f.aviso === "excluido" ? "line-through opacity-70" : ""}`}>{f.nombre}</span>
                <span className="block text-xs text-[var(--text-tertiary)]">{f.categoria}</span>
                <Avisos f={f} bajo={bajoDe(f)} cambio={cambiadas.has(f.productId)} />
              </td>
              <td className={`${td} text-right`}><Hoy f={f} /></td>
              <td className={`${td} text-right`}><Queda f={f} valor={precios[f.productId]} onPrecio={onPrecio} /></td>
              <td className={`${td} text-right`}><Margen f={f} precio={precioFinal(f, precios)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <label className="flex items-center gap-3 px-3 text-sm font-semibold text-[var(--text-secondary)] sm:hidden">
        <CasillaTodas {...todas} />
        Todas ({todas.marcadas} de {todas.total})
      </label>
      <ul className="space-y-2 sm:hidden">
        {filas.map((f) => (
          <li
            key={f.productId}
            className={`rounded-xl border p-3 ${cambiadas.has(f.productId) ? "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10" : "border-[var(--rule-base)]"}`}
          >
            <div className="flex items-start gap-3">
              <Casilla f={f} marcada={marcadas.has(f.productId)} onMarcar={onMarcar} />
              <div className="min-w-0 flex-1 space-y-2">
                <span className={`block text-sm font-semibold text-[var(--text-primary)] [overflow-wrap:anywhere] ${f.aviso === "excluido" ? "line-through opacity-70" : ""}`}>{f.nombre}</span>
                <Avisos f={f} bajo={bajoDe(f)} cambio={cambiadas.has(f.productId)} />
                <div className="flex items-end justify-between gap-2">
                  <Hoy f={f} />
                  <Queda f={f} valor={precios[f.productId]} onPrecio={onPrecio} />
                </div>
                <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                  margen <Margen f={f} precio={precioFinal(f, precios)} />
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
