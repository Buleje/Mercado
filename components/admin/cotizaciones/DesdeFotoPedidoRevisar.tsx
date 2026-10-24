"use client";

/**
 * Revisar lo que se leyó de la foto del pedido, línea por línea, ANTES de
 * pasarlo a la cotización: lo dudoso (confianza baja o sin producto) va en
 * ámbar y se corrige eligiendo otro producto de la lista. El precio que vale
 * es el del catálogo; el escrito en el papel se muestra sólo si es distinto.
 */
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Alternativa, LineaEmparejada } from "@/lib/ventas/emparejar-pedido";

const SELECT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const AMBAR = "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]";

/** Valor del `<select>` para «no es ninguno: lo escribo yo». */
export const SIN_PRODUCTO = "";

/** El elegido y sus alternativas, sin repetir. */
export function opcionesDe(l: LineaEmparejada): Alternativa[] {
  const propias: Alternativa[] =
    l.productoId != null && l.productoNombre != null && l.precioCatalogo != null
      ? [{ productoId: l.productoId, nombre: l.productoNombre, precio: l.precioCatalogo, taxType: l.taxType }]
      : [];
  const vistos = new Set(propias.map((o) => o.productoId));
  return [...propias, ...l.alternativas.filter((a) => !vistos.has(a.productoId) && vistos.add(a.productoId))];
}

/** Hay que mirarla: el lector dudó o no la halló en el catálogo. */
export const esDudosa = (l: LineaEmparejada) => l.confianza === "baja" || l.confianza === "sin_match";

const ETIQUETA: Record<LineaEmparejada["confianza"], string | null> = {
  alta: null,
  media: "Revisa",
  baja: "Revisa este",
  sin_match: "No está en tu catálogo",
};

interface Props {
  lineas: LineaEmparejada[];
  /** Por línea, el `productoId` elegido (texto) o `SIN_PRODUCTO`. */
  elegidos: string[];
  onElegir: (idx: number, valor: string) => void;
}

export function DesdeFotoPedidoRevisar({ lineas, elegidos, onElegir }: Props) {
  return (
    <ul className="space-y-2">
      {lineas.map((l, idx) => {
        const opciones = opcionesDe(l);
        const elegido = opciones.find((o) => String(o.productoId) === elegidos[idx]) ?? null;
        const dudosa = esDudosa(l) || elegido == null;
        const etiqueta = elegido == null ? ETIQUETA.sin_match : ETIQUETA[l.confianza];
        const precioDistinto = elegido != null && l.precioLeido != null && Math.abs(l.precioLeido - elegido.precio) >= 0.01;
        return (
          <li
            key={`${idx}-${l.textoLeido}`}
            className={cn(
              "grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center",
              dudosa ? "border-[var(--data-warning-500)]" : "border-[var(--rule-soft)]",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-[var(--text-primary)]">
                <span className="font-semibold tabular-nums">{l.cantidad} ×</span> «{l.textoLeido}»
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                {etiqueta && <span className={cn("rounded-full px-2 text-sm font-semibold", dudosa ? AMBAR : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]")}>{etiqueta}</span>}
                {precioDistinto && <span>En el papel {formatCurrency(l.precioLeido ?? 0)}: vale el del catálogo</span>}
              </p>
            </div>
            <label className="min-w-0">
              <span className="sr-only">Producto para «{l.textoLeido}»</span>
              <select value={elegidos[idx] ?? SIN_PRODUCTO} onChange={(e) => onElegir(idx, e.target.value)} className={SELECT}>
                {opciones.map((o) => (
                  <option key={o.productoId} value={String(o.productoId)}>
                    {o.nombre} — {formatCurrency(o.precio)}
                  </option>
                ))}
                <option value={SIN_PRODUCTO}>Ninguno: lo escribo yo</option>
              </select>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
