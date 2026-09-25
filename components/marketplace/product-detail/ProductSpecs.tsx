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
  /** Datos reales cargados por el vendedor en admin (Inventario). */
  brand?: string | null;
  weightKg?: number | null;
  dimensions?: string | null;
  /** Especificaciones libres cargadas por el vendedor (label/value). */
  customSpecs?: Array<{ label: string; value: string }>;
}

interface SpecRow {
  label: string;
  value: string;
}

function buildSpecs(p: ProductSpecsProps): SpecRow[] {
  // Solo specs reales del producto (cargadas en admin). Nada inventado.
  const rows: SpecRow[] = [];
  if (p.brand) rows.push({ label: "Marca", value: p.brand });
  if (p.category) rows.push({ label: "Categoría", value: p.category });
  if (p.unit) rows.push({ label: "Unidad de venta", value: p.unit });
  if (typeof p.weightKg === "number" && p.weightKg > 0) {
    rows.push({ label: "Peso", value: `${p.weightKg} kg` });
  }
  if (p.dimensions) rows.push({ label: "Medidas", value: p.dimensions });
  // Specs libres del vendedor (ingredientes, origen, garantía, etc.).
  for (const s of p.customSpecs ?? []) {
    if (s.label?.trim() && s.value?.trim()) {
      rows.push({ label: s.label.trim(), value: s.value.trim() });
    }
  }
  rows.push({ label: "Precio", value: `S/ ${p.price.toFixed(2)}` });
  return rows;
}

export function ProductSpecs(props: ProductSpecsProps) {
  const specs = buildSpecs(props);

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
