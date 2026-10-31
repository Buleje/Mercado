import { cn } from "@/lib/utils";

/**
 * PrecioPartes — el precio partido de la home «Dosel»: `S/` + entero grande +
 * `.50` chico, todo con cifras tabulares (Geist). Solo MUESTRA lo que manda el
 * backend; no calcula nada. es-PE usa punto decimal y no se esconde «.00».
 *
 * El entero crece con el ancho de la tarjeta (container query: la tarjeta es
 * `@container`): 18 px en tarjetas angostas, 20 px desde 10rem de contenido (la grilla).
 */

interface Props {
  /** El catálogo lo manda como string ("22"): se normaliza acá. */
  precio: number | string;
  /** Precio anterior (tachado) — solo si es mayor que el actual. */
  anterior?: number | string | null;
  /** "lg" fija 18 px (filas de urgencia). Default: crece con la tarjeta. */
  tamano?: "auto" | "lg";
  className?: string;
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

export default function PrecioPartes({ precio, anterior, tamano = "auto", className }: Props) {
  const n = Number(precio);
  if (!Number.isFinite(n)) return null;
  const [entero, decimales] = n.toFixed(2).split(".");
  const previo = anterior != null ? Number(anterior) : NaN;
  const conAnterior = Number.isFinite(previo) && previo > n;

  return (
    <p className={cn("relative flex flex-wrap items-baseline gap-x-1.5 tabular-nums", className)}>
      <span className="sr-only">
        {soles(n)}
        {conAnterior ? `, antes ${soles(previo)}` : ""}
      </span>
      <span aria-hidden className="inline-flex items-baseline font-extrabold leading-none text-[var(--text-primary)]">
        <span className="mr-0.5 text-sm font-bold">S/</span>
        <span
          className={cn(
            "tracking-[-0.02em]",
            tamano === "lg"
              ? "text-[length:var(--ts-lg)]"
              : "text-[length:var(--ts-lg)] @min-[10rem]:text-[length:var(--ts-xl)]",
          )}
        >
          {Number(entero).toLocaleString("es-PE")}
        </span>
        <span className="text-sm font-bold">.{decimales}</span>
      </span>
      {conAnterior && (
        <s aria-hidden className="text-xs font-medium text-[var(--text-tertiary)]">
          {soles(previo)}
        </s>
      )}
    </p>
  );
}
