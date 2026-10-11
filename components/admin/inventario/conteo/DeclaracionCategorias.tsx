import { DataTable } from "@buleje/design-system";
import { Layers } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { categoriasDe, costoDe, precioDe, unidadesDe, type DeclaracionData } from "./declaracion-tipos";

/** El detalle de la declaración: una tabla de productos por cada categoría. */
export function DeclaracionCategorias({ data }: { data: DeclaracionData }) {
  return (
    <div className="space-y-4 print:space-y-2">
      {Object.entries(categoriasDe(data)).map(([categoria, items]) => (
        <div key={categoria} className="overflow-hidden rounded-xl bg-[var(--surface-raised)]">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-sm font-bold text-[var(--text-primary)]">{categoria}</span>
              <span className="text-sm text-[var(--text-secondary)]">({items.length} productos)</span>
            </div>
            <div className="flex gap-4 text-sm text-[var(--text-secondary)]">
              <span>{unidadesDe(items)} uds</span>
              <span>Costo: {formatCurrency(costoDe(items))}</span>
              <span>Precio: {formatCurrency(precioDe(items))}</span>
            </div>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th className="text-right">Stock</th>
                <th className="hidden text-right sm:table-cell">Costo unit.</th>
                <th className="hidden text-right sm:table-cell">Valor costo</th>
                <th className="hidden text-right md:table-cell">Precio unit.</th>
                <th className="hidden text-right md:table-cell">Valor precio</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-sm text-[var(--text-secondary)]">{p.sku}</td>
                  <td className="max-w-[200px] truncate text-[var(--text-primary)]">{p.name}</td>
                  <td className="text-right font-medium text-[var(--text-primary)]">{p.stock}</td>
                  <td className="hidden text-right text-[var(--text-secondary)] sm:table-cell">{formatCurrency(p.costPrice)}</td>
                  <td className="hidden text-right font-medium text-[var(--text-secondary)] sm:table-cell">{formatCurrency(p.stock * p.costPrice)}</td>
                  <td className="hidden text-right text-[var(--text-secondary)] md:table-cell">{formatCurrency(p.price)}</td>
                  <td className="hidden text-right font-medium text-[var(--text-secondary)] md:table-cell">{formatCurrency(p.stock * p.price)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      ))}
    </div>
  );
}
