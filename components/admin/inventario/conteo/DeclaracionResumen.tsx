import { DollarSign, Layers, Package, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";
import { categoriasDe, type DeclaracionData, type HistorialEntry } from "./declaracion-tipos";

/** «Tu inventario»: el valor a costo de hoy y cuánto cambió desde la declaración anterior. */
export function DeclaracionTuInventario({ resumen, historial }: { resumen: DeclaracionData; historial: HistorialEntry[] }) {
  const valor = resumen.valorCosto ?? 0;
  const ultima = historial.length >= 2 ? historial[historial.length - 2] : null;
  const dif = ultima ? valor - ultima.valorCosto : 0;
  const pct = ultima && ultima.valorCosto > 0 ? (dif / ultima.valorCosto) * 100 : 0;
  const sube = dif > 0;
  const baja = dif < 0;
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-2 flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-secondary)]">Tu inventario</p>
      </div>
      <p className={cn("font-mono text-3xl font-bold", baja ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>{formatCurrency(valor)}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {resumen.totalProductos} productos · {resumen.totalUnidades} unidades · {Object.keys(categoriasDe(resumen)).length} categorías
      </p>
      {ultima && (
        <p className={cn("mt-2 inline-flex items-center gap-1 text-sm font-bold", sube ? "text-[var(--data-success-ink)]" : baja ? "text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]")}>
          {sube ? <TrendingUp className="h-4 w-4" aria-hidden /> : baja ? <TrendingDown className="h-4 w-4" aria-hidden /> : null}
          {sube ? "+" : ""}{pct.toFixed(1)}% frente a la anterior
        </p>
      )}
    </div>
  );
}

/** Las cuatro cifras de la declaración recién generada. */
export function DeclaracionCifras({ data }: { data: DeclaracionData }) {
  const cifras = [
    { rotulo: "Productos", valor: formatNumber(data.totalProductos ?? 0), Icono: Package },
    { rotulo: "Unidades", valor: formatNumber(data.totalUnidades ?? 0), Icono: Layers },
    { rotulo: "Valor a costo", valor: formatCurrency(data.valorCosto ?? 0), Icono: DollarSign },
    { rotulo: "Valor a precio de venta", valor: formatCurrency(data.valorPrecio ?? 0), Icono: DollarSign },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cifras.map(({ rotulo, valor, Icono }) => (
        <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <Icono className="mb-2 h-4 w-4 text-primary" aria-hidden />
          <p className="text-sm font-bold text-[var(--text-secondary)]">{rotulo}</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{valor}</p>
        </div>
      ))}
    </div>
  );
}
