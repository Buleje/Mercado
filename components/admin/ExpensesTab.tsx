"use client";

/**
 * Mi Plata › Movimientos › Gastos. Patrón del panel (noche 11-10): cabecera en
 * una fila (título · Indicadores · «Anotar gasto» · «⋯»), y la lista con su
 * fila de filtros —buscador, categoría y el período— pegada encima. Lo que
 * antes ocupaba la primera pantalla (dos cifras grandes, la línea de fijos,
 * ocho tarjetas de categoría y el gráfico de 6 meses) vive en los Indicadores.
 */

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { Download, MoreHorizontal, Plus, Receipt, RefreshCw } from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";
import { formatCurrency, formatMonth } from "@/lib/format";
import { diaDelGasto, primeroDelMes } from "@/lib/gastos/lista-gastos";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import GastoNuevoModal from "@/components/admin/gastos/GastoNuevoModal";
import ListaGastos, { descargarCsvGastos, gastosVisibles, type GastoDeLaLista } from "@/components/admin/gastos/ListaGastos";
import type { GastoGuardado } from "@/components/admin/gastos/use-gasto-nuevo";
import { useIndicadoresGastos } from "@/components/admin/unified/finanzas/gastos/use-indicadores-gastos";

type Expense = GastoDeLaLista;

/** Lo que se le cuenta a la persona después de guardar. */
function avisoGuardado(r: GastoGuardado): void {
  if (!r.caja) toast.success(`Gasto de ${formatCurrency(r.monto)} guardado`);
  else if (r.caja.sinCaja) toast.warning("Gasto guardado. No había caja abierta: la caja no se tocó.");
  else toast.success(`Gasto guardado y ${formatCurrency(r.monto)} salieron de la caja`);
}
type Summary = { category: string; total: number; count: number };

interface Props {
  /**
   * «Ver el catálogo»: abre el catálogo de gastos fijos en esta misma vista
   * (Mi Plata › Gastos y presupuesto). Desde la ola 3 del panel unificado el
   * catálogo ya no vive en Compras › Comprar. Sin esto, no hay botón.
   */
  onVerCatalogo?: () => void;
  /**
   * Sube cuando algo de afuera cambió los gastos (un fijo pagado, quitado o
   * agregado en el catálogo de abajo): relee la lista sin remontarla, así no
   * se pierden las fechas, la categoría ni el formulario abierto.
   */
  recarga?: number;
}

export default function ExpensesTab({ onVerCatalogo, recarga = 0 }: Props = {}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /** Filtra la lista; se elige en el selector o tocando una tarjeta de categoría. */
  const [categoria, setCategoria] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [tick, setTick] = useState(0);
  /** Las relecturas propias (borrar, guardar) y las que pide quien la monta. */
  const vuelta = tick + recarga;
  const [historicExpenses, setHistoricExpenses] = useState<Expense[]>([]);
  // Los gastos fijos configurados (Expense.recurring=true) son PLANTILLAS: el
  // acuerdo de pagar el alquiler, no el alquiler pagado. Desde que dejaron de
  // sumar al total —contarlos inflaba el P&L con plata que nadie desembolsó—
  // hay que decir que existen, o desaparecen sin explicación.
  const [templates, setTemplates] = useState<Expense[]>([]);

  // Días de Pucallpa, no de UTC: con `toISOString()` a partir de las 19:00 el
  // «desde» salía el 2 y los gastos del 1 se perdían de la lista y del total.
  const [from, setFrom] = useState(() => primeroDelMes(limaDateKey()));
  const [to, setTo] = useState(() => limaDateKey());

  useEffect(() => {
    let active = true;
    // Sólo la primera carga tapa la vista: al borrar o cambiar fechas, la lista
    // queda (con lo que escribiste en el buscador) hasta que llega la nueva.
    Promise.all([
      fetch(`/api/expenses?from=${from}&to=${to}&caja=1`).then(r => {
        if (!r.ok) throw new Error(`gastos ${r.status}`);
        return r.json() as Promise<Expense[]>;
      }),
      fetch("/api/expenses/summary").then(r => r.ok ? r.json() : []),
      fetch("/api/expenses?recurring=true").then(r => r.ok ? r.json() : []),
    ]).then(([exp, sum, tpl]) => {
      if (active) {
        setExpenses(Array.isArray(exp) ? exp : []);
        setSummary(Array.isArray(sum) ? sum : []);
        setTemplates(Array.isArray(tpl) ? tpl : []);
        setError(false);
        setLoading(false);
      }
    }).catch((err) => {
      console.warn("[ExpensesTab] la lista de gastos no cargó:", err);
      if (active) { setError(true); setLoading(false); }
    });
    return () => { active = false; };
  }, [from, to, vuelta]);

  // Los últimos 6 meses para el gráfico (no dependen del filtro de fechas).
  useEffect(() => {
    const hoy = limaDateKey();
    fetch(`/api/expenses?from=${primeroDelMes(hoy, 5)}&to=${hoy}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setHistoricExpenses(Array.isArray(data) ? data : []))
      .catch((err) => console.warn("[ExpensesTab] /api/expenses failed:", err));
  }, [vuelta]);

  const monthlyExpenseData = useMemo(() => {
    const hoy = limaDateKey();
    return Array.from({ length: 6 }, (_, i) => {
      const mes = primeroDelMes(hoy, 5 - i);
      // El mes del DÍA del gasto: el anotado el 1 sin hora es medianoche UTC
      // y con `getMonth()` en Lima caía en el mes anterior.
      const total = historicExpenses
        .filter(e => diaDelGasto(e.date).slice(0, 7) === mes.slice(0, 7))
        .reduce((s, e) => s + Number(e.amount), 0);
      return { label: formatMonth(mes, { soloFecha: true }), total };
    });
  }, [historicExpenses]);

  const totalPeriod = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const visibles = useMemo(() => gastosVisibles(expenses, buscar, categoria), [expenses, buscar, categoria]);
  const kpis = useIndicadoresGastos({
    delPeriodo: totalPeriod,
    cuantosDelPeriodo: expenses.length,
    desde: from,
    hasta: to,
    categorias: summary,
    fijos: { cuantos: templates.length, monto: templates.reduce((s, t) => s + Number(t.amount), 0) },
    porMes: monthlyExpenseData,
    cargando: loading,
  });

  if (loading) return <LoadingState />;

  const acciones: MenuAccion[] = [
    {
      id: "csv",
      label: "Descargar CSV",
      hint: `${visibles.length} ${visibles.length === 1 ? "gasto" : "gastos"}, con el buscador y la categoría`,
      icon: Download,
      onSelect: () => descargarCsvGastos(visibles, from, to, categoria),
      disabled: visibles.length === 0,
    },
    /* Sin `onVerCatalogo` no hay catálogo a la vista (quien no veía Compras no
       lo ve acá tampoco): una acción que no abre nada, no. */
    ...(onVerCatalogo
      ? [{ id: "catalogo", label: "Gastos fijos del catálogo", hint: templates.length > 0 ? `${templates.length} configurados: no suman hasta pagarlos` : "Pagar con un toque o agregar uno", icon: Receipt, onSelect: onVerCatalogo }]
      : []),
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => setTick((v) => v + 1) },
  ];

  return (
    <div className="space-y-4">
      {/* Una fila: título · Indicadores · Anotar gasto · «⋯». */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Gastos</SectionTitle>
          <InfoTip
            title="Gastos"
            what="Lo que salió del negocio que no es mercadería: alquiler, luz, transporte, estiba. Elige el período en la fila de filtros."
            affects="Los fijos del catálogo no suman hasta que registras su pago. El techo de estos gastos está abajo, en Presupuesto del mes."
            example="Pagaste la luz de setiembre el 05/10: es un gasto de octubre."
          />
        </div>
        {/* `justify-end`: si el titular del botón se corta, el hueco queda a la izquierda y no después del «⋯». */}
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
          {kpis.boton}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className={button({ variant: "primary", className: "h-12 shrink-0 gap-2 rounded-xl px-4" })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Anotar gasto</span>
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Descargar CSV, gastos fijos y actualizar" />
        </div>
      </div>
      {kpis.panel}

      <GastoNuevoModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onGuardado={(r) => { setShowForm(false); setTick(v => v + 1); avisoGuardado(r); }}
      />

      {/* La lista del período: buscar, categoría, fechas y borrar con confirmación. */}
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--surface-raised)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--text-primary)]">No se pudieron cargar los gastos del período.</p>
          <button type="button" onClick={() => setTick(v => v + 1)} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
            <RefreshCw className="h-4 w-4" aria-hidden />Reintentar
          </button>
        </div>
      ) : (
        <ListaGastos
          gastos={expenses}
          desde={from}
          hasta={to}
          onDesde={setFrom}
          onHasta={setTo}
          buscar={buscar}
          onBuscar={setBuscar}
          categoria={categoria}
          onCategoria={setCategoria}
          onCambio={() => setTick(v => v + 1)}
        />
      )}
    </div>
  );
}
