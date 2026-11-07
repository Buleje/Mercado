"use client";

/**
 * Las 4 tarjetas de Cuentas (Adelantos, Gastos, Ingresos, Por cobrar) y la
 * línea «Entró · Salió · Queda». Las cifras vienen del servidor. Cada tarjeta es
 * un botón (`aria-pressed`): tocarla filtra la tabla; tocarla otra vez la suelta.
 */
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { CuentasDelPeriodo, GrupoCuenta } from "@/lib/finance/cuentas-tipos";
import { TarjetaIndicador } from "./TarjetaIndicador";
import { GRUPOS } from "./cuentas-agrupado";

/** Lo que muestra la tabla: un grupo, todos (`null`) o la lista de deudores. */
export type FiltroDeCuentas = GrupoCuenta | "por-cobrar" | null;

const ORDEN: readonly GrupoCuenta[] = ["adelantos", "gastos", "ingresos"];
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function TarjetaTocable({ activa, onToggle, etiqueta, borde, children }: {
  activa: boolean; onToggle: () => void; etiqueta: string; borde: string; children: ReactNode;
}) {
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onToggle();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={activa}
      aria-label={etiqueta}
      onClick={onToggle}
      onKeyDown={alTeclear}
      className={cn(
        "min-w-0 cursor-pointer rounded-xl border-l-4 transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        borde,
        activa && "ring-2 ring-[var(--accent)]",
      )}
    >
      {children}
    </div>
  );
}

interface Props {
  datos: CuentasDelPeriodo;
  filtro: FiltroDeCuentas;
  onFiltro: (f: FiltroDeCuentas) => void;
}

export function TarjetasDeCuentas({ datos, filtro, onFiltro }: Props) {
  const alternar = (f: Exclude<FiltroDeCuentas, null>) => onFiltro(filtro === f ? null : f);
  const nDeudores = datos.porCobrar.deudores.length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ORDEN.map((g) => {
          const t = datos.totales[g];
          return (
            <TarjetaTocable
              key={g}
              activa={filtro === g}
              onToggle={() => alternar(g)}
              etiqueta={`${GRUPOS[g].rotulo}: ${formatCurrency(t.monto)}. Filtrar la tabla`}
              borde={GRUPOS[g].borde}
            >
              <TarjetaIndicador
                rotulo={GRUPOS[g].rotulo}
                valor={formatCurrency(t.monto)}
                nota={`${GRUPOS[g].entra ? "Entró" : "Salió"} · ${cuantos(t.n, "movimiento", "movimientos")}`}
                tono={filtro === g ? "destacado" : "neutro"}
              />
            </TarjetaTocable>
          );
        })}
        <TarjetaTocable
          activa={filtro === "por-cobrar"}
          onToggle={() => alternar("por-cobrar")}
          etiqueta={`Por cobrar: ${formatCurrency(datos.porCobrar.total)}. Ver quién debe`}
          borde="border-l-[var(--data-info-500)]"
        >
          <TarjetaIndicador
            rotulo="Por cobrar"
            valor={formatCurrency(datos.porCobrar.total)}
            nota={`Hoy · ${cuantos(nDeudores, "persona", "personas")}`}
            tono={filtro === "por-cobrar" ? "destacado" : "neutro"}
          />
        </TarjetaTocable>
      </div>
      <p className="text-sm font-semibold text-[var(--text-secondary)]" data-testid="cuentas-linea">
        Entró <span className="whitespace-nowrap font-extrabold tabular-nums text-[var(--data-success-ink)]">{formatCurrency(datos.entro)}</span>
        {" · "}Salió <span className="whitespace-nowrap font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(datos.salio)}</span>
        {" · "}Queda{" "}
        <span className={cn("whitespace-nowrap font-extrabold tabular-nums", datos.queda < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>
          {formatCurrency(datos.queda)}
        </span>
      </p>
    </div>
  );
}
