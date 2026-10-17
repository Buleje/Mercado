import { CardTitle, DataTable } from "@buleje/design-system";
import { Check } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { nombreDe } from "./wizard-tipos";
import type { ConteoWizard } from "./use-conteo-wizard";

/** Paso 3: las diferencias encontradas y cuáles se ajustan al cerrar. */
export function WizardPaso3({ w }: { w: ConteoWizard }) {
  const aAjustar = w.conDiferencia.filter((i) => i.ajustado).length;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Diferencias encontradas</CardTitle>
          <span className="text-sm text-[var(--text-secondary)]">{w.conDiferencia.length} productos con diferencia</span>
        </div>
        {w.conDiferencia.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-secondary)]">No hay diferencias: todo coincide con el sistema.</p>
        ) : (
          <div className="overflow-x-auto">
            <DataTable className="w-full">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-center">Sistema</th>
                  <th className="text-center">Contado</th>
                  <th className="text-center">Diferencia</th>
                  <th className="text-center">Ajustar</th>
                </tr>
              </thead>
              <tbody>
                {w.conDiferencia.map((item) => {
                  const dif = item.diferencia ?? 0;
                  return (
                    <tr key={item.id}>
                      <td>{item.product?.name ?? `#${item.productId}`}</td>
                      <td className="text-center text-[var(--text-secondary)]">{item.stockSistema}</td>
                      <td className="text-center font-medium">{item.stockContado}</td>
                      <td className={cn("text-center font-bold", dif > 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}>
                        {dif > 0 ? "+" : ""}{dif}
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={item.ajustado}
                          onChange={() => w.toggleAjustado(item.id)}
                          aria-label={`Ajustar ${nombreDe(item)}`}
                          className="h-6 w-6 rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => w.setPaso(2)} className={button({ variant: "secondary", className: "rounded-xl" })}>
          Volver a contar
        </button>
        <button type="button" onClick={w.cerrarConteo} disabled={w.loading} className={button({ variant: "primary", className: "flex-1 rounded-xl" })}>
          {w.loading ? "Cerrando…" : `Aplicar ${aAjustar} ajustes y cerrar`}
        </button>
      </div>
    </div>
  );
}

/** Paso 4: el conteo quedó cerrado. */
export function WizardPaso4({ w }: { w: ConteoWizard }) {
  const r = w.resumen;
  if (!r) return null;
  const cifras = [
    { n: r.contados, t: "Productos contados", clase: "bg-[var(--surface-sunken)]", color: "text-[var(--text-primary)]" },
    { n: r.totalItems, t: "Productos del conteo", clase: "bg-[var(--surface-sunken)]", color: "text-[var(--text-primary)]" },
    { n: r.conDiferencia, t: "Con diferencia", clase: "bg-[var(--data-warning-50)]", color: "text-[var(--data-warning-ink)]" },
    { n: r.ajustados, t: "Ajustes aplicados", clase: "bg-primary/10", color: "text-[var(--data-success-ink)]" },
  ];
  return (
    <div className="space-y-6 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Check className="h-8 w-8 text-[var(--data-success-ink)]" aria-hidden />
      </div>
      <CardTitle>Conteo cerrado</CardTitle>
      <div className="grid grid-cols-2 gap-4">
        {cifras.map((c) => (
          <div key={c.t} className={cn("rounded-lg p-4", c.clase)}>
            <div className={cn("text-2xl font-bold tabular-nums", c.color)}>{c.n}</div>
            <div className="text-sm text-[var(--text-secondary)]">{c.t}</div>
          </div>
        ))}
      </div>
      <button type="button" onClick={w.nuevoConteo} className={button({ variant: "primary", className: "rounded-xl px-6" })}>
        Nuevo conteo
      </button>
    </div>
  );
}
