"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { agruparDuplicados } from "@/lib/expense-meta";
import { formatCurrency } from "@/lib/format";
import { csrfHeaders } from "@/lib/csrf-client";
import type { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { PagoPropuesto } from "@/components/admin/compras/historial/ConfirmarPagoModal";
import { pagarGastoFijo, type PagoDeFijo } from "@/components/admin/compras/historial/pagar-fijo";

export type ExpenseTemplate = {
  id: string;
  category: string;
  description: string;
  amount: number;
  recurring: boolean;
  paymentMethod?: string | null;
};

export type PagoHecho = { description: string; amount: number; date: string; templateId?: string | null };

type Opciones = {
  playDing: () => void;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  setToastMsg: Dispatch<SetStateAction<string | null>>;
};

/**
 * Gastos fijos del Punto de compra (Expense.recurring=true): alquiler,
 * gasolina, internet… Click en la tarjeta → registra el gasto real del período.
 */
export function useGastosFijos({ playDing, confirm, setToastMsg }: Opciones) {
  const [expenseCatalog, setExpenseCatalog] = useState<ExpenseTemplate[]>([]);
  const [expenseCatalogLoading, setExpenseCatalogLoading] = useState(true);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [executingTemplateId, setExecutingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Una carga que salió antes de borrar trae la lista vieja: el doble montaje de
  // React lanza dos GET y, si el segundo volvía después de eliminar, la
  // plantilla borrada reaparecía (el mismo bug medido en Tareas el 2026-09-14).
  // Sólo aplica su lista la carga más nueva, y nunca vuelve a mostrar lo borrado.
  // No se recarga tras borrar como en Tareas: `ExpensesDB.getAll` usa "use cache"
  // y el borrado invalida con `revalidateTag(tag, "max")`, que sirve la copia
  // vieja al pedido siguiente, así que esa recarga traería la plantilla de vuelta.
  const cargasCatalogoRef = useRef({ ultima: 0, borrados: new Set<string>() });
  const fetchExpenseCatalog = useCallback(async () => {
    const esta = ++cargasCatalogoRef.current.ultima;
    setExpenseCatalogLoading(true);
    try {
      const res = await fetch("/api/expenses?recurring=true");
      if (res.ok) {
        const data = await res.json();
        if (esta === cargasCatalogoRef.current.ultima) {
          const lista: ExpenseTemplate[] = Array.isArray(data) ? data : [];
          const { borrados } = cargasCatalogoRef.current;
          setExpenseCatalog(borrados.size > 0 ? lista.filter((e) => !borrados.has(e.id)) : lista);
        }
      }
    } catch (err) {
      console.warn("[PuntoCompraView] expense catalog fetch failed", err);
    } finally {
      if (esta === cargasCatalogoRef.current.ultima) setExpenseCatalogLoading(false);
    }
  }, []);

  useEffect(() => { fetchExpenseCatalog(); }, [fetchExpenseCatalog]);

  /**
   * Los gastos YA registrados. Sin esto la tarjeta ofrecía «Pagar» igual
   * hubieras pagado o no — la misma trampa que los duplicados, por otro camino.
   */
  const [pagosHechos, setPagosHechos] = useState<PagoHecho[]>([]);
  /** Sube tras registrar un pago: sin esto la tarjeta seguía «pendiente». */
  const [vueltaPagos, setVueltaPagos] = useState(0);
  useEffect(() => {
    fetch("/api/expenses", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const arr = Array.isArray(d) ? d : [];
        setPagosHechos(
          arr
            .filter((e: { recurring?: boolean }) => !e.recurring)
            .map((e: { description?: string; amount?: number; date?: string; createdAt?: string; templateId?: string | null }) => ({
              description: e.description ?? "",
              amount: Number(e.amount ?? 0),
              date: e.date ?? e.createdAt ?? "",
              templateId: e.templateId ?? null,
            })),
        );
      })
      .catch((err) => console.warn("[PuntoCompraView] pagos hechos fetch failed", err));
  }, [expenseCatalog, vueltaPagos]);

  /** Una sola fecha de referencia por montaje: si cada render creara la suya,
   *  el «vence en N días» podría cambiar entre repintados. */
  const [hoyRef] = useState(() => new Date());
  // El catálogo real traía SEIS tarjetas para tres gastos: el riesgo es pagar
  // dos veces. Se muestra uno por gasto y se avisa del resto.
  const { unicos: expenseCatalogUnico, duplicados: expenseDuplicados } = useMemo(
    () => agruparDuplicados(expenseCatalog, (g) => ({ description: g.description ?? "", amount: Number(g.amount ?? 0) })),
    [expenseCatalog],
  );

  const fallar = useCallback((msg: string) => {
    setExpenseError(msg);
    setTimeout(() => setExpenseError(null), 4000);
  }, []);

  // Pagar un fijo pasa por el mismo «Registrar pago» del Historial: monto,
  // fecha, con qué pagaste y si sale de la caja. Antes un toque registraba el
  // alquiler con la fecha de hoy sin preguntar, y nunca salía del cajón.
  const [porConfirmar, setPorConfirmar] = useState<(PagoPropuesto & { metodoPlantilla: string | null }) | null>(null);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const pedirPago = useCallback((pago: PagoPropuesto) => {
    setErrorPago(null);
    setPorConfirmar({ ...pago, metodoPlantilla: pago.metodo ?? null });
  }, []);
  const cerrarPago = useCallback(() => { setPorConfirmar(null); setErrorPago(null); }, []);

  const confirmarPago = useCallback(async (pago: PagoDeFijo) => {
    const tpl = porConfirmar;
    if (!tpl || executingTemplateId) return;
    setExecutingTemplateId(tpl.id);
    setErrorPago(null);
    const r = await pagarGastoFijo(tpl.id, pago, tpl.metodoPlantilla);
    setExecutingTemplateId(null);
    if (!r.ok) { setErrorPago(r.error); return; }
    setPorConfirmar(null);
    setVueltaPagos((v) => v + 1);
    playDing();
    setToastMsg([`Gasto registrado: ${tpl.nombre} · ${formatCurrency(pago.monto)}`, r.aviso].filter(Boolean).join(" · "));
    setTimeout(() => setToastMsg(null), r.aviso ? 6000 : 3000);
  }, [porConfirmar, executingTemplateId, playDing, setToastMsg]);

  // Eliminar template recurrente del catálogo. Pide confirmación para evitar
  // borrados accidentales; el id queda anotado para que ninguna carga lo devuelva.
  const handleDeleteTemplate = useCallback(async (tpl: ExpenseTemplate, humanDesc: string) => {
    if (deletingTemplateId) return;
    if (!(await confirm({
      title: `¿Eliminar "${humanDesc || tpl.category}" del catálogo?`,
      description: "No se borran los gastos ya pagados, sólo la plantilla.",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    }))) return;
    setDeletingTemplateId(tpl.id);
    try {
      const res = await fetch(`/api/expenses/${tpl.id}`, {
        method: "DELETE",
        headers: csrfHeaders({}),
      });
      if (res.ok) {
        cargasCatalogoRef.current.borrados.add(tpl.id);
        setExpenseCatalog((prev) => prev.filter((e) => e.id !== tpl.id));
        playDing();
        setToastMsg(`Eliminado: ${humanDesc || tpl.category}`);
        setTimeout(() => setToastMsg(null), 2500);
      } else {
        const err = await res.json().catch(() => ({}));
        fallar(err.error || "Error al eliminar");
      }
    } catch (err) {
      console.warn("[PuntoCompraView] delete template failed", err);
      fallar("Error de conexión");
    } finally {
      setDeletingTemplateId(null);
    }
  }, [deletingTemplateId, playDing, confirm, setToastMsg, fallar]);

  const alCrear = useCallback(() => { void fetchExpenseCatalog(); playDing(); }, [fetchExpenseCatalog, playDing]);

  return {
    expenseCatalog, expenseCatalogLoading, expenseCatalogUnico, expenseDuplicados, expenseError,
    showNewExpense, setShowNewExpense, executingTemplateId, deletingTemplateId, pagosHechos, hoyRef,
    porConfirmar, errorPago, pedirPago, cerrarPago, confirmarPago, handleDeleteTemplate, alCrear,
  };
}

export type GastosFijos = ReturnType<typeof useGastosFijos>;
