import { BlockTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatDateNumeric } from "@/lib/format";
import type { ConteoWizard } from "./use-conteo-wizard";

const TIPOS = [
  { id: "completo", rotulo: "Todo el almacén" },
  { id: "categoria", rotulo: "Una categoría" },
] as const;

/** Paso 1: qué vas a contar, y los conteos que dejaste a medias. */
export function WizardPaso1({ w }: { w: ConteoWizard }) {
  const enCurso = w.conteos.filter((c) => c.status !== "CERRADO");
  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-6">
        <BlockTitle>¿Qué vas a contar?</BlockTitle>
        <div className="flex gap-3" role="radiogroup" aria-label="Tipo de conteo">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={w.tipo === t.id}
              onClick={() => w.setTipo(t.id)}
              className={cn(
                "min-h-12 flex-1 rounded-xl border-2 px-3 text-sm font-semibold transition-colors",
                w.tipo === t.id
                  ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
              )}
            >
              {t.rotulo}
            </button>
          ))}
        </div>

        {w.tipo === "categoria" && (
          <Field label="Categoría" labelClassName="mb-1 block text-sm font-medium text-[var(--text-primary)]">
            <input
              type="text"
              value={w.categoria}
              onChange={(e) => w.setCategoria(e.target.value)}
              placeholder="Ej: Abarrotes, Bebidas…"
              className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)]"
            />
          </Field>
        )}

        <button
          type="button"
          onClick={w.iniciarConteo}
          disabled={w.loading || (w.tipo === "categoria" && !w.categoria.trim())}
          className={button({ variant: "primary", fullWidth: true, className: "rounded-xl" })}
        >
          {w.loading ? "Creando…" : "Empezar a contar"}
        </button>
      </div>

      {enCurso.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-6">
          <BlockTitle className="mb-3">Conteos sin cerrar</BlockTitle>
          <div className="space-y-2">
            {enCurso.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => w.reanudarConteo(c.id)}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] p-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <span>
                  <span className="text-sm font-medium capitalize text-[var(--text-primary)]">{c.tipo}</span>
                  <span className="ml-2 text-sm text-[var(--text-secondary)]">{formatDateNumeric(c.fechaInicio)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-1 text-sm text-[var(--data-warning-ink)]">{c.status}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{c._count.items} productos</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
