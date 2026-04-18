"use client";

/**
 * ProductSpecs — Ficha técnica del producto.
 * Tabla 2-col con datos reales del producto + mock SUNAT/empaque.
 */

import { Kicker, SectionTitle, Caption } from "@buleje/design-system";

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
  return [
    { label: "Categoría", value: category || "General" },
    { label: "Unidad de venta", value: unit || "Unidad" },
    { label: "Precio referencial", value: `S/ ${price.toFixed(2)}` },
    { label: "Origen", value: "Ucayali, Perú" },
    { label: "Código SUNAT", value: "84101001" },
    { label: "Marca", value: "Marca local" },
    { label: "Unidades por caja", value: "12" },
    { label: "Temperatura", value: "Ambiente" },
    { label: "Condición", value: "Nuevo" },
  ];
}

export function ProductSpecs({ name, category, unit, price }: ProductSpecsProps) {
  const specs = buildSpecs(name, category, unit, price);

  return (
    <section aria-label="Ficha técnica" className="space-y-3">
      <Kicker as="p">Especificaciones</Kicker>
      <SectionTitle as="h2">Ficha técnica</SectionTitle>

      <div className="overflow-hidden rounded-xl border border-[var(--rule-muted)]">
        <table className="w-full text-[length:var(--ts-sm)]">
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
                <td className="py-2.5 px-4 font-medium text-[var(--text-secondary)] w-2/5 border-r border-[var(--rule-muted)]">
                  {row.label}
                </td>
                <td className="py-2.5 px-4 text-[var(--text-primary)]">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-[var(--rule-muted)] bg-[var(--surface-sunken)]">
          <Caption className="text-[var(--text-tertiary)]">
            Datos referenciales. Verificar con el vendedor ante cualquier duda.
          </Caption>
        </div>
      </div>
    </section>
  );
}
