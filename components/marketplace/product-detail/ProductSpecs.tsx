"use client";

/**
 * ProductSpecs — Ficha técnica del producto.
 * Tabla 2-col con datos reales del producto + mock SUNAT/empaque.
 */

export interface ProductSpecsProps {
  name: string;
  category: string | null | undefined;
  unit: string | null | undefined;
  price: number;
}

interface SpecRow {
  label: string;
  value: string;
}

function buildSpecs(
  name: string,
  category: string | null | undefined,
  unit: string | null | undefined,
  price: number
): SpecRow[] {
  // Solo specs reales del producto. Sin SUNAT/marca/temperatura inventados.
  const rows: SpecRow[] = [];
  if (category) rows.push({ label: "Categoría", value: category });
  if (unit) rows.push({ label: "Unidad de venta", value: unit });
  rows.push({ label: "Precio", value: `S/ ${price.toFixed(2)}` });
  return rows;
}

export function ProductSpecs({ name, category, unit, price }: ProductSpecsProps) {
  const specs = buildSpecs(name, category, unit, price);

  return (
    <section
      aria-label="Ficha técnica"
      className="space-y-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-flex h-1 w-12 rounded-full bg-[var(--accent)]" />
        <p className="text-sm font-bold uppercase tracking-wider text-[var(--accent)]">
          Especificaciones
        </p>
      </div>
      <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">
        Ficha técnica
      </h2>

      <div className="overflow-hidden rounded-xl border-2 border-[var(--rule-base)]">
        <table className="w-full text-base">
          <tbody>
            {specs.map((row, i) => (
              <tr
                key={row.label}
                className={
                  i % 2 === 0
                    ? "bg-[var(--surface-canvas)]"
                    : "bg-[var(--surface-sunken)]"
                }
              >
                <td className="py-3.5 px-5 font-semibold text-[var(--text-secondary)] w-2/5 border-r-2 border-[var(--rule-base)]">
                  {row.label}
                </td>
                <td className="py-3.5 px-5 text-[var(--text-primary)] font-medium">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <p className="text-sm text-[var(--text-tertiary)]">
            Datos publicados por el vendedor.
          </p>
        </div>
      </div>
    </section>
  );
}
