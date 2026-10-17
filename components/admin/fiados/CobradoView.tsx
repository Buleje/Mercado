"use client";

/**
 * «Cobrado»: quién te pagó, cuánto, cuándo y con qué, del cobro más reciente
 * al más viejo, y la tendencia de cobro del semestre al lado.
 *
 * Nuevo el 10-10: los cobros de fiado sólo se veían fiado por fiado (en su
 * ficha) o mezclados con el resto de la caja. Absorbió las tres franjas de
 * colores del Resumen («abonaron esta semana», «mejor pagador», la proyección
 * de cobro) en una línea, y la gráfica de la pestaña Análisis.
 */
import { useMemo, useState, type ComponentType } from "react";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { ETIQUETA_METODO } from "@/lib/fiados/cobro-metodo";
import { diaLeido } from "./fechas";
import type { Fiado } from "./tipos";

const TOPE = 15;
const MEDIOS = Object.values(ETIQUETA_METODO);

/** El medio va al inicio de la nota de la cuota («Yape · nota»): no hay columna. */
function medioYNota(notas?: string): { medio: string | null; nota: string } {
  const t = notas?.trim() ?? "";
  for (const m of MEDIOS) {
    if (t === m) return { medio: m, nota: "" };
    if (t.startsWith(`${m} · `)) return { medio: m, nota: t.slice(m.length + 3) };
  }
  return { medio: null, nota: t };
}

type Props = {
  fiados: Fiado[];
  pagosEstaSemana: { pagaron: number; total: number };
  mejorPagadorMes: { nombre: string; total: number } | null;
  promedioDiario: number;
  diasRestantes: number;
  onVerFiado: (f: Fiado) => void;
  Tendencia: ComponentType;
};

export default function CobradoView({ fiados, pagosEstaSemana, mejorPagadorMes, promedioDiario, diasRestantes, onVerFiado, Tendencia }: Props) {
  const [verTodos, setVerTodos] = useState(false);

  const cobros = useMemo(() => {
    const out: { id: string; fecha: string; monto: number; fiado: Fiado; medio: string | null; nota: string }[] = [];
    for (const f of fiados) {
      for (const c of f.cuotas) out.push({ id: c.id, fecha: c.pagadoEn ?? c.createdAt, monto: c.monto, fiado: f, ...medioYNota(c.notas) });
    }
    return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [fiados]);

  const visibles = verTodos ? cobros : cobros.slice(0, TOPE);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="ultimos-cobros" className="min-w-0 overflow-clip rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--rule-soft)] px-4 py-3">
          <CardTitle id="ultimos-cobros" className="text-sm font-bold text-[var(--text-primary)]">
            Últimos cobros <span className="font-semibold text-[var(--text-secondary)]">· {cobros.length}</span>
          </CardTitle>
          <InfoTip
            what="Cada pago de un fiado, con la fecha en que entró y el medio con que te pagaron (si se anotó al cobrar)."
            affects="Si cobraste con la caja abierta, el mismo pago está en Caja › Movimientos como «Cobro de fiado»."
          />
        </div>
        <p className="border-b border-[var(--rule-soft)] px-4 py-2 text-sm text-[var(--text-secondary)]">
          {pagosEstaSemana.total > 0 && <>Esta semana abonaron <strong className="text-[var(--text-primary)]">{pagosEstaSemana.pagaron} de {pagosEstaSemana.total}</strong> clientes que deben</>}
          {mejorPagadorMes && <> · el que más pagó este mes: <strong className="text-[var(--text-primary)]">{mejorPagadorMes.nombre} ({formatCurrency(mejorPagadorMes.total)})</strong></>}
          {promedioDiario > 0 && <> · a este ritmo ({formatCurrency(promedioDiario)} por día) cobras todo en <strong className="text-[var(--text-primary)]">{diasRestantes} días</strong></>}
          {pagosEstaSemana.total === 0 && !mejorPagadorMes && promedioDiario === 0 && "Todavía nadie pagó este mes."}
        </p>
        {cobros.length === 0 ? (
          <p className="px-4 py-6 text-base text-[var(--text-secondary)]">Cuando cobres un fiado, el pago sale acá.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {visibles.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="w-28 shrink-0 text-sm text-[var(--text-secondary)]">{diaLeido(c.fecha)}</span>
                <span className="min-w-0 flex-1 basis-32">
                  <button type="button" onClick={() => onVerFiado(c.fiado)} className="block max-w-full truncate text-left text-base font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline">
                    {c.fiado.customerName || c.fiado.customerId}
                  </button>
                  {(c.medio || c.nota) && (
                    <span className="block truncate text-sm text-[var(--text-secondary)]">{[c.medio, c.nota].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
                <span className="shrink-0 text-base font-bold tabular-nums text-[var(--data-success-ink)]">{formatCurrency(c.monto)}</span>
              </li>
            ))}
          </ul>
        )}
        {cobros.length > TOPE && (
          <button type="button" onClick={() => setVerTodos((v) => !v)} className="h-12 w-full border-t border-[var(--rule-soft)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            {verTodos ? "Ver menos" : `Ver los ${cobros.length}`}
          </button>
        )}
      </section>
      <div className="min-w-0">
        <Tendencia />
      </div>
    </div>
  );
}
