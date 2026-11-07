"use client";

import { TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { DIAS_VIGENCIA_MERCADO, type ResumenMercado as Resumen, type SugerenciaMercado } from "@/lib/compras/mercado";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const TARJETA = "rounded-xl border px-3 py-2 text-sm font-semibold";
const VERDE = "border-[var(--data-success-500)]/30 bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/10";
const AMBAR = "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10";

interface Props {
  resumen: Resumen;
  sugerencias: SugerenciaMercado[];
  onAjustar: (productId: string, precio: number) => void;
}

/**
 * Lo que dicen los precios VIGENTES de la competencia (C38): en cuántas
 * comparaciones eres más barato, dónde puedes subir y, por producto, tu precio
 * frente al promedio. Un precio viejo, sin fecha o en dólares no entra.
 */
export default function ResumenMercado({ resumen, sugerencias, onAjustar }: Props) {
  if (resumen.comparadas === 0 && sugerencias.length === 0) {
    return resumen.fueraDeCuenta > 0 ? (
      <p className="text-sm text-[var(--text-secondary)]">
        Ningún precio anotado está al día: {resumen.fueraDeCuenta} {resumen.fueraDeCuenta === 1 ? "es viejo, no tiene fecha o está" : "son viejos, no tienen fecha o están"} en dólares. Vuelve a anotarlos para comparar.
      </p>
    ) : null;
  }

  const caros = sugerencias.filter((s) => s.estado === "caro").length;
  const baratos = sugerencias.filter((s) => s.estado === "barato").length;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <p className={cn(TARJETA, VERDE)}>
          <TrendingUp className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          Eres más barato en {resumen.masBarato} de {resumen.comparadas} comparaciones
        </p>
        {resumen.oportunidad && (
          <p className={cn(TARJETA, AMBAR)}>
            Puedes subir «{resumen.oportunidad.producto}» {formatCurrency(resumen.oportunidad.diferencia)} y no pasar al más barato
          </p>
        )}
      </div>

      {sugerencias.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            Tu precio frente al promedio
            <InfoTip
              title="Cómo se calcula"
              what={`Promedio de lo que cobra la competencia con precios en soles vistos hace ${DIAS_VIGENCIA_MERCADO} días o menos. A S/ 1 o menos del promedio cuenta como alineado.`}
              affects="«Ajustar» cambia sólo «Tu precio» en esta tabla (al promedio menos 50 céntimos). Tu precio de venta real se cambia en Productos."
              example="Competencia a S/ 5,00 y S/ 5,40 → promedio S/ 5,20 → sugerido S/ 4,70."
            />
            {resumen.fueraDeCuenta > 0 && (
              <span className="font-normal text-[var(--text-tertiary)]">
                · {resumen.fueraDeCuenta} precio{resumen.fueraDeCuenta === 1 ? "" : "s"} viejo{resumen.fueraDeCuenta === 1 ? "" : "s"}, sin fecha o en dólares no cuenta{resumen.fueraDeCuenta === 1 ? "" : "n"}
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {sugerencias.slice(0, 6).map((s) => (
              <li key={s.productId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{s.productName}</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Tú {formatCurrency(s.myPrice)} · promedio {formatCurrency(s.promedio)} de {s.muestra} precio{s.muestra === 1 ? "" : "s"}
                  </p>
                </div>
                {s.estado === "alineado" ? (
                  <span className="text-sm text-[var(--text-tertiary)]">Alineado</span>
                ) : (
                  <>
                    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", s.estado === "caro" ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]")}>
                      {s.estado === "caro" ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
                      {formatCurrency(Math.abs(s.diferencia))} {s.estado === "caro" ? "más caro" : "más barato"} · sugerido {formatCurrency(s.sugerido)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAjustar(s.productId, s.sugerido)}
                      className={button({ variant: "secondary", className: "rounded-xl" })}
                      title="Cambia sólo «Tu precio» en esta tabla"
                    >
                      Ajustar
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {(caros > 0 || baratos > 0) && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {caros > 0 && <span className="font-semibold text-[var(--data-warning-ink)]">{caros} más caro{caros === 1 ? "" : "s"} que la competencia</span>}
              {caros > 0 && baratos > 0 && " · "}
              {baratos > 0 && <span className="font-semibold text-[var(--data-success-ink)]">{baratos} con margen para subir</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
