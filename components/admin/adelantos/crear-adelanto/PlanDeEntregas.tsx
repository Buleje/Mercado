"use client";

/**
 * El plan de entregas de un adelanto pactado.
 *
 * Existía en la base (`AdelantoEntregaPactada`), en el contrato del endpoint y
 * en el cálculo de cobranza —que mide el atraso contra la entrega pactada
 * incumplida— pero NO en la pantalla de alta: elegir «Entregas pactadas» creaba
 * un adelanto con el plan vacío, así que la cobranza caía siempre al plan B
 * (antigüedad) y las columnas de la base quedaban muertas.
 */

import { CalendarDays, Plus, Trash2, Wand2 } from "@buleje/design-system/icons";
import { RITMOS, diaLocal, diferenciaDelPlan, planCuadra, repartirCuotas } from "@/lib/adelantos/plan-cuotas";
import { formatCurrency } from "@/lib/currency";
import { inputCls } from "../shared";
import type { CuotaBorrador } from "./tipos";

export default function PlanDeEntregas({
  cuotas,
  onCambiar,
  montoAdelantado,
  moneda,
}: {
  cuotas: CuotaBorrador[];
  onCambiar: (c: CuotaBorrador[]) => void;
  montoAdelantado: number;
  moneda: string;
}) {
  const valores = cuotas.map((c) => c.valor);
  const diferencia = diferenciaDelPlan(montoAdelantado, valores);
  const sumado = Math.round((montoAdelantado - diferencia) * 100) / 100;
  const cuadra = planCuadra(montoAdelantado, valores);

  const editar = (key: string, campo: keyof CuotaBorrador, valor: string) =>
    onCambiar(cuotas.map((c) => (c.key === key ? { ...c, [campo]: valor } : c)));

  const agregar = () => {
    const ultima = cuotas[cuotas.length - 1];
    const f = ultima?.fecha ? new Date(`${ultima.fecha}T12:00:00`) : new Date();
    f.setDate(f.getDate() + 30);
    onCambiar([
      ...cuotas,
      {
        key: `cuota-manual-${cuotas.length}-${f.getTime()}`,
        descripcion: `Cuota ${cuotas.length + 1}`,
        /* Lo que falta para cuadrar: es el valor que se iba a tipear igual. */
        valor: diferencia > 0 ? diferencia.toFixed(2) : "",
        fecha: diaLocal(f),
      },
    ]);
  };

  return (
    <div className="space-y-3 rounded-xl bg-primary/8 p-4 ring-1 ring-primary/25">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Plan de entregas {cuotas.length > 0 && `· ${cuotas.length}`}
        </p>
        <p className={`text-sm font-bold tabular-nums ${cuadra ? "text-[var(--data-success)]" : "text-[var(--data-warning)]"}`}>
          {cuotas.length === 0
            ? "sin cuotas todavía"
            : cuadra
              ? `cuadra con ${formatCurrency(montoAdelantado)}`
              : diferencia > 0
                ? `faltan ${formatCurrency(diferencia)}`
                : `sobran ${formatCurrency(Math.abs(diferencia))}`}
        </p>
      </div>

      {/* Repartir automático: es como se pacta de verdad («me lo devolvés en 3
          veces»), y tipear tres filas iguales a mano es la vía rápida a que
          nadie lo use. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Wand2 className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span className="text-sm font-semibold text-[var(--text-tertiary)]">Repartir en</span>
        {[2, 3, 4, 6, 12].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!(montoAdelantado > 0)}
            onClick={() => onCambiar(conKeys(repartirCuotas(montoAdelantado, n, "mensual")))}
            title={montoAdelantado > 0 ? `${n} cuotas mensuales de ${formatCurrency(montoAdelantado / n)}` : "Poné primero el monto"}
            className="h-9 rounded-lg bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
          >
            {n}
          </button>
        ))}
        <span className="text-sm font-semibold text-[var(--text-tertiary)]">·</span>
        {RITMOS.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={!(montoAdelantado > 0) || cuotas.length === 0}
            onClick={() => onCambiar(conKeys(repartirCuotas(montoAdelantado, cuotas.length || 2, r.id)))}
            title={`Recalcular las fechas ${r.label}`}
            className="h-9 rounded-lg bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
          >
            {r.label}
          </button>
        ))}
      </div>

      {cuotas.length > 0 && (
        <ul className="space-y-2">
          {cuotas.map((c, i) => (
            <li key={c.key} className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-raised)] text-sm font-extrabold tabular-nums text-[var(--text-secondary)]">
                {i + 1}
              </span>
              <input
                value={c.descripcion}
                onChange={(e) => editar(c.key, "descripcion", e.target.value)}
                placeholder="Qué te entrega"
                aria-label={`Descripción de la cuota ${i + 1}`}
                className={`${inputCls} h-11 flex-1`}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={c.valor}
                onChange={(e) => editar(c.key, "valor", e.target.value)}
                placeholder="0.00"
                aria-label={`Valor de la cuota ${i + 1}`}
                className={`${inputCls} h-11 w-28 tabular-nums`}
              />
              <input
                type="date"
                value={c.fecha}
                onChange={(e) => editar(c.key, "fecha", e.target.value)}
                aria-label={`Fecha de la cuota ${i + 1}`}
                className={`${inputCls} h-11 w-40 tabular-nums`}
              />
              <button
                type="button"
                onClick={() => onCambiar(cuotas.filter((x) => x.key !== c.key))}
                aria-label={`Quitar la cuota ${i + 1}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error)]/10 hover:text-[var(--data-error)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={agregar}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--surface-raised)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <Plus className="h-4 w-4" /> Agregar cuota
        </button>
        {cuotas.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-tertiary)]">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Sin plan, la cobranza mide el atraso por antigüedad, no por compromiso.
          </span>
        )}
      </div>

      {cuotas.length > 0 && !cuadra && (
        <p className="text-sm font-semibold text-[var(--data-warning)]">
          El plan suma {fmtCuota(sumado, moneda)} y el adelanto es de {fmtCuota(montoAdelantado, moneda)}. Se guarda igual —
          a veces se pacta de a poco — pero conviene que cierre.
        </p>
      )}
    </div>
  );
}

function fmtCuota(n: number, moneda: string): string {
  return moneda === "USD" ? `$ ${n.toFixed(2)}` : formatCurrency(n);
}

/**
 * La clave de React de cada fila.
 *
 * Va acá y no en la lib pura porque es un detalle del render: `repartirCuotas`
 * calcula plata y fechas, y no tiene por qué saber de listas de React. Usa el
 * número de cuota y su fecha —no el índice— para que reordenar no re-monte las
 * filas y pierda el foco de quien está tipeando.
 */
function conKeys(calculadas: { descripcion: string; valor: string; fecha: string }[]): CuotaBorrador[] {
  return calculadas.map((c, i) => ({ key: `cuota-${i + 1}-${c.fecha}`, descripcion: c.descripcion, valor: c.valor, fecha: c.fecha }));
}
