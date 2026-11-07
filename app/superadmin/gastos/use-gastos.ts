"use client";

/**
 * useGastos — toda la data + mutaciones de /superadmin/gastos en un solo hook
 * (saca el fetch del componente, per code-quality). Cruza 3 fuentes: gastos
 * reales de plataforma (+ el P&L del mes que arma el servidor: cobrado, MRR,
 * gasto e infra estimada) y costos de infra por tienda.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PnlPlataforma } from "@/lib/billing/mrr-plataforma";
import type { Expense, Summary, CostsData, BudgetByCategory, HistoryMonth } from "./gastos-helpers";

export type ExpenseInput = {
  concept: string;
  category: string;
  amount: number;
  currency: string;
  recurring: boolean;
  period: string;
  vendor: string;
  notes?: string;
};

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const EXPENSES_URL = "/api/superadmin/platform-expenses";

export function useGastos() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [costs, setCosts] = useState<CostsData | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [budgetByCategory, setBudgetByCategory] = useState<BudgetByCategory>({});
  const [history, setHistory] = useState<HistoryMonth[]>([]);
  const [fxRate, setFxRate] = useState<number>(3.75);
  const [pnl, setPnl] = useState<PnlPlataforma | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch(EXPENSES_URL, { credentials: "include", cache: "no-store" }),
        fetch("/api/superadmin/costs", { credentials: "include", cache: "no-store" }),
      ]);
      if (a.ok) {
        const j = await a.json();
        setExpenses(j.expenses ?? []);
        setSummary(j.summary ?? null);
        setBudget(typeof j.budgetPen === "number" ? j.budgetPen : null);
        setBudgetByCategory(j.budgetByCategory ?? {});
        setHistory(Array.isArray(j.history) ? j.history : []);
        if (typeof j.fxRate === "number") setFxRate(j.fxRate);
        setPnl(j.pnl ?? null);
      }
      if (b.ok) {
        const j = await b.json();
        setCosts({ totalMonthlyCost: j.totalMonthlyCost, avgGrossMargin: j.avgGrossMargin, tenants: j.tenants ?? [] });
      }
    } catch {
      setErr("No se pudieron cargar los gastos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(
    async (method: "POST" | "PATCH", body: unknown): Promise<boolean> => {
      setBusy(true);
      setErr(null);
      try {
        const res = await fetch(EXPENSES_URL, {
          method,
          credentials: "include",
          headers: csrfHeaders(JSON_HEADERS),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setErr("No se pudo guardar el gasto.");
          return false;
        }
        await load();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const addExpense = useCallback(
    (input: ExpenseInput) =>
      send("POST", { ...input, period: input.recurring ? input.period : "", notes: input.notes ?? "" }),
    [send],
  );

  const updateExpense = useCallback(
    (id: string, input: ExpenseInput) =>
      send("PATCH", { id, ...input, period: input.recurring ? input.period : "", notes: input.notes ?? "" }),
    [send],
  );

  const removeExpense = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await fetch(EXPENSES_URL, {
          method: "DELETE",
          credentials: "include",
          headers: csrfHeaders(JSON_HEADERS),
          body: JSON.stringify({ id }),
        });
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const saveBudget = useCallback(
    async (budgetPen: number | null) => {
      setBusy(true);
      setErr(null);
      try {
        await fetch(EXPENSES_URL, {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders(JSON_HEADERS),
          body: JSON.stringify({ budgetPen }),
        });
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const saveBudgetByCategory = useCallback(
    async (next: BudgetByCategory) => {
      setBusy(true);
      setErr(null);
      try {
        await fetch(EXPENSES_URL, {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders(JSON_HEADERS),
          body: JSON.stringify({ budgetByCategory: next }),
        });
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const saveFxRate = useCallback(
    async (usdToPen: number) => {
      setBusy(true);
      setErr(null);
      try {
        await fetch(EXPENSES_URL, {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders(JSON_HEADERS),
          body: JSON.stringify({ usdToPen }),
        });
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  return {
    expenses, summary, costs, budget, budgetByCategory, history, fxRate, pnl,
    mrrPen: pnl?.ingresos.mrrEstimadoPen ?? 0,
    payingTenants: pnl?.ingresos.tiendasQuePagan ?? 0,
    loading, busy, err, setErr, load,
    addExpense, updateExpense, removeExpense, saveBudget, saveBudgetByCategory, saveFxRate,
  };
}
