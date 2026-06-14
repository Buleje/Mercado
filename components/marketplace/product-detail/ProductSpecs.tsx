/**
 * ProductSpecs — Ficha técnica del producto.
 * Rediseño Brandon 2026-06-14: estilo MercadoLibre — bordes RECTOS, tipografía
 * suave (sin font-black), sin acentos neón. Tabla zebra 2-col con datos reales.
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
      className="border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <h2 className="border-b border-[var(--rule-soft)] px-4 py-3 text-base sm:text-lg font-semibold text-[var(--text-primary)]">
        Ficha técnica
      </h2>

      <table className="w-full text-sm">
        <tbody>
          {specs.map((row, i) => (
            <tr
              key={row.label}
              className={i % 2 === 0 ? "bg-[var(--surface-raised)]" : "bg-[var(--surface-sunken)]"}
            >
              <td className="py-3 px-4 text-[var(--text-secondary)] w-2/5 border-r border-[var(--rule-soft)]">
                {row.label}
              </td>
              <td className="py-3 px-4 text-[var(--text-primary)]">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-[var(--rule-soft)] px-4 py-2.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
        Datos publicados por el vendedor.
      </p>
    </section>
  );
}
