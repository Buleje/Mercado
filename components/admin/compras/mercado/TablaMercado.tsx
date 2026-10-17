"use client";

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Plus, Trash2, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import {
  antiguedad,
  diferenciaPct,
  DIAS_VIGENCIA_MERCADO,
  FUENTES_MERCADO,
  precioVigente,
  type CompetidorMercado,
  type PrecioVisto,
  type ProductoMercado,
} from "@/lib/compras/mercado";
import { diaCorto } from "@/lib/compras/ciclo-oc";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CasillaMercado } from "./PrecioVistoModal";

const CHIP = "inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-sm font-semibold";
const CHIP_AMBAR = "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15";
const CHIP_GRIS = "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
const CELDA = "inline-flex min-h-12 flex-col items-end justify-center rounded-xl px-2 text-right hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

const fuente = (v: PrecioVisto["fuente"]) => FUENTES_MERCADO.find((f) => f.value === v)?.label ?? "Otro";
const plata = (p: PrecioVisto) => (p.moneda === "USD" ? `US$ ${p.precio.toFixed(2).replace(".", ",")}` : formatCurrency(p.precio));

/** El origen entero en el «title» de la casilla: de dónde salió y quién lo vio o anotó. */
function origen(p: PrecioVisto): string {
  return [
    p.fecha ? `Visto el ${diaCorto(p.fecha)}` : "Sin fecha",
    fuente(p.fuente),
    p.responsable ? `lo vio ${p.responsable}` : null,
    p.registradoPor ? `anotado por ${p.registradoPor}` : null,
    p.nota || null,
  ].filter(Boolean).join(" · ");
}

function Casilla({ p, miPrecio, hoy }: { p: PrecioVisto; miPrecio: number; hoy: string }) {
  const dias = antiguedad(p, hoy);
  const vigente = precioVigente(p, hoy);
  const dif = vigente ? diferenciaPct(miPrecio, p.precio) : null;
  return (
    <>
      <span className="font-semibold tabular-nums text-[var(--text-primary)]">{plata(p)}</span>
      {p.moneda === "USD" ? (
        <span className={cn(CHIP, CHIP_GRIS)}>En dólares</span>
      ) : dias === null ? (
        <span className={cn(CHIP, CHIP_GRIS)}>Sin fecha</span>
      ) : dias > DIAS_VIGENCIA_MERCADO ? (
        <span className={cn(CHIP, CHIP_AMBAR)}>Hace {dias} días</span>
      ) : dif !== null && dif !== 0 ? (
        // + = el competidor cobra más que tú (verde: tú estás más barato).
        <span className={cn("inline-flex items-center gap-0.5 text-sm font-semibold", dif > 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}>
          {dif > 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
          {dif > 0 ? "+" : ""}{dif} %
        </span>
      ) : (
        <span className="text-sm text-[var(--text-tertiary)]">{dif === 0 ? "Igual que tú" : diaCorto(p.fecha ?? hoy)}</span>
      )}
    </>
  );
}

interface Props {
  productos: ProductoMercado[];
  competidores: CompetidorMercado[];
  hoy: string;
  onCasilla: (c: CasillaMercado) => void;
  onMiPrecio: (productId: string, precio: number) => void;
  onQuitarProducto: (p: ProductoMercado) => void;
}

/**
 * Producto × competidor (C38). Cada casilla abre «Precio de …» con su origen;
 * el % compara con tu precio sólo si el precio sigue vigente y está en soles.
 */
export default function TablaMercado({ productos, competidores, hoy, onCasilla, onMiPrecio, onQuitarProducto }: Props) {
  const [editando, setEditando] = useState<{ id: string; valor: string } | null>(null);

  const cerrarEdicion = (guardar: boolean) => {
    if (guardar && editando) {
      const n = Number(editando.valor.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) onMiPrecio(editando.id, Math.round(n * 100) / 100);
    }
    setEditando(null);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
        <thead>
          <tr>
            <th>Producto</th>
            <th className="text-right">Tu precio</th>
            {competidores.map((c) => <th key={c.id} className="text-right">{c.name}</th>)}
            <th className="w-12"><span className="sr-only">Quitar</span></th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.productId}>
              <td className="font-medium">{p.productName}</td>
              <td className="text-right">
                {editando?.id === p.productId ? (
                  <input
                    type="text" inputMode="decimal" autoFocus
                    value={editando.valor}
                    onChange={(e) => setEditando({ id: p.productId, valor: e.target.value })}
                    onBlur={() => cerrarEdicion(true)}
                    onKeyDown={(e) => { if (e.key === "Enter") cerrarEdicion(true); if (e.key === "Escape") { e.stopPropagation(); cerrarEdicion(false); } }}
                    aria-label={`Tu precio de ${p.productName}`}
                    className="h-12 w-24 rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-2 text-right text-sm tabular-nums text-[var(--text-primary)]"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditando({ id: p.productId, valor: String(p.myPrice).replace(".", ",") })}
                    className={cn(CELDA, "font-bold text-[var(--accent-ink)]")}
                    title="Tu precio de venta, sólo en esta tabla"
                  >
                    {p.myPrice > 0 ? formatCurrency(p.myPrice) : "Anotar"}
                  </button>
                )}
              </td>
              {competidores.map((c) => {
                const visto = p.prices[c.id] ?? null;
                return (
                  <td key={c.id} className="text-right">
                    <button
                      type="button"
                      onClick={() => onCasilla({ productId: p.productId, productName: p.productName, competidorId: c.id, competidorNombre: c.name, actual: visto })}
                      className={CELDA}
                      title={visto ? origen(visto) : `Anotar lo que cobra ${c.name}`}
                      aria-label={visto ? `${c.name}: ${plata(visto)}. ${origen(visto)}` : `Anotar el precio de ${c.name} para ${p.productName}`}
                    >
                      {visto ? (
                        <Casilla p={visto} miPrecio={p.myPrice} hoy={hoy} />
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)]"><Plus className="h-3.5 w-3.5" aria-hidden /> Anotar</span>
                      )}
                    </button>
                  </td>
                );
              })}
              <td className="text-center">
                <button
                  type="button"
                  onClick={() => onQuitarProducto(p)}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-ink)] dark:hover:bg-[var(--data-error-500)]/15"
                  aria-label={`Quitar ${p.productName} de la lista`}
                  title="Quitar de la lista"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
