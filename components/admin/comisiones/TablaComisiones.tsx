"use client";

import { DataTable } from "@buleje/design-system";
import { Banknote, CreditCard, Smartphone, Users, Wallet } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { diaDelGasto } from "@/lib/gastos/lista-gastos";
import { cn } from "@/lib/utils";
import type { FilaComision, Rango, ResultadoComisiones } from "@/lib/comisiones/calcular";
import { TONO_FALTA, TONO_PAGADA, diaConNombre, fmt, tramoDias } from "./formato";

/** Pendiente de la fila; con un pago que cruza dice con cuál, en vez de una cifra que no se puede pagar acá. */
function CeldaPendiente({ f }: { f: FilaComision }) {
  if (f.cruce) {
    return f.cubierto ? (
      <span className={TONO_PAGADA} title={`Ya entra en el pago del ${tramoDias(f.cruce)}`}>
        Pagada <span className="block text-sm font-semibold">{tramoDias(f.cruce)}</span>
      </span>
    ) : (
      <span className={TONO_FALTA} title={`Este período se pisa con el pago del ${tramoDias(f.cruce)}: esos días ya se pagaron.`}>
        Cruza <span className="block text-sm font-semibold">{tramoDias(f.cruce)}</span>
      </span>
    );
  }
  if (f.pendiente > 0) return <span className={TONO_FALTA}>{fmt(f.pendiente)}</span>;
  // Con comisión 0 no hay nada que pagar: «Pagada» se leía como un pago que no existe.
  if (f.comision <= 0 && f.pagado <= 0) return <span className="font-normal text-[var(--text-secondary)]">—</span>;
  return <span className={TONO_PAGADA}>Pagada</span>;
}

const FUENTE: Record<string, string> = { propia: "propia", general: "general", por_defecto: "por defecto" };

/** Con qué se paga: se elige al tocar «Pagar» de la fila (antes era un selector suelto arriba de la tabla). */
const MEDIOS = [
  { id: "efectivo", label: "En efectivo", icon: Banknote },
  { id: "yape", label: "Por Yape", icon: Smartphone },
  { id: "plin", label: "Por Plin", icon: Smartphone },
  { id: "transferencia", label: "Por transferencia", icon: CreditCard },
];

type Props = {
  datos: ResultadoComisiones | null;
  pagando: string | null;
  onPagar: (fila: FilaComision, medio: string) => void;
  /** Con un pago que cruza: pasa a «Elegir fechas» con los días que quedan libres. */
  onVerRango?: (r: Rango) => void;
  /** Las ventas de ese vendedor, una por una. */
  onVerVentas: (fila: FilaComision) => void;
  loading: boolean;
  /** En el estado vacío: lo único accionable es dejar lista la regla antes de vender. */
  onVerReglas?: () => void;
};

/** Lo ganado por vendedor en el período. Las cifras vienen del backend. */
export default function TablaComisiones({ datos, pagando, onPagar, onVerRango, onVerVentas, loading, onVerReglas }: Props) {
  const filas = datos?.filas ?? [];
  if (loading && !datos) {
    return (
      <div className="flex justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8" role="status" aria-label="Calculando comisiones">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (filas.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
        <Users className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Sin ventas con vendedor en este período.</p>
        {onVerReglas && (
          <button type="button" onClick={onVerReglas} className="mt-2 min-h-12 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ver las reglas de comisión
          </button>
        )}
      </div>
    );
  }
  return (
    // Las cifras no se parten en dos renglones («S/» arriba, el monto abajo); el nombre sí puede.
    <DataTable className={cn("min-w-[720px] [&_td+td]:whitespace-nowrap", loading && "opacity-60")}>
      <thead>
        <tr>
          <th>Vendedor</th><th className="text-right">Ventas</th><th className="text-right">Vendido</th><th className="text-right">Regla</th>
          <th className="text-right">Comisión</th><th className="text-right">Pagado</th><th className="text-right">Pendiente</th><th><span className="sr-only">Pagar</span></th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.cashierId}>
            <td>
              <button
                type="button"
                onClick={() => onVerVentas(f)}
                title="Ver sus ventas del período"
                className="min-h-12 text-left font-semibold text-[var(--text-primary)] underline decoration-[var(--rule-strong)]/30 underline-offset-4 hover:decoration-[var(--accent)]"
              >
                {f.cashierName}
              </button>
            </td>
            <td className="text-right tabular-nums text-[var(--text-secondary)]">{f.ventas}</td>
            <td className="text-right tabular-nums">{fmt(f.vendido)}</td>
            <td className="text-right tabular-nums text-[var(--text-secondary)]" title={f.tramo ?? undefined}><span>{f.tasa} % · {FUENTE[f.fuente]}</span></td>
            <td className="text-right font-bold tabular-nums">{fmt(f.comision)}</td>
            {/* Un solo hijo: en las tarjetas del celular la celda es flex y partía la cifra y el día en dos columnas. */}
            <td className="text-right tabular-nums text-[var(--text-secondary)]">
              <div className="min-w-0">
              {f.pagado > 0 ? fmt(f.pagado) : "—"}
              {/* El pago queda como gasto con su instante: el día va en hora de Lima. */}
              {f.ultimoPago && <span className="block text-sm">el {diaConNombre(diaDelGasto(f.ultimoPago))}</span>}
              </div>
            </td>
            <td className="text-right font-bold tabular-nums"><CeldaPendiente f={f} /></td>
            <td className="text-right">
              {f.pendiente > 0 && (
                <ActionMenu
                  label={pagando === f.cashierId ? "Pagando…" : "Pagar"}
                  icon={Wallet}
                  size="md"
                  disabled={pagando != null || loading}
                  actions={MEDIOS.map((m) => ({ id: m.id, label: m.label, icon: m.icon, onSelect: () => onPagar(f, m.id) }))}
                />
              )}
              {f.cruce && !f.cubierto && f.libre && onVerRango && (
                <button type="button" disabled={loading} onClick={() => { if (f.libre) onVerRango(f.libre); }} className="inline-flex min-h-12 items-center whitespace-nowrap rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 dark:text-[var(--accent)]">
                  Ver {tramoDias(f.libre)}
                </button>
              )}
            </td>
          </tr>
        ))}
        {datos && (
          <tr className="bg-[var(--surface-sunken)] font-bold">
            <td className="whitespace-nowrap"><span>Total <span className="block text-sm font-normal text-[var(--text-secondary)]">{tramoDias(datos)}</span></span></td>
            <td className="text-right tabular-nums">{datos.totales.ventas}</td>
            <td className="text-right tabular-nums">{fmt(datos.totales.vendido)}</td>
            <td />
            <td className="text-right tabular-nums">{fmt(datos.totales.comision)}</td>
            <td className="text-right tabular-nums">{fmt(datos.totales.pagado)}</td>
            <td className="text-right tabular-nums">{fmt(datos.totales.pendiente)}</td>
            <td />
          </tr>
        )}
      </tbody>
    </DataTable>
  );
}
