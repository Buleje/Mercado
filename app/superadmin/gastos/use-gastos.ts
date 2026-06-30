"use client";

/**
 * useGastos — toda la data + mutaciones de /superadmin/gastos en un solo hook
 * (saca el fetch del componente, per code-quality). Cruza 3 fuentes: gastos
 * reales de plataforma, costos de infra por tienda, y billing (MRR) para el P&L.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { Expense, Summary, CostsData, BudgetByCategory } from "./gastos-helpers";

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
  const [fxRate, setFxRate] = useState<number>(3.75);
  const [mrrPen, setMrrPen] = useState<number>(0);
  const [payingTenants, setPayingTenants] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        fetch(EXPENSES_URL, { credentials: "include", cache: "no-store" }),
        fetch("/api/superadmin/costs", { credentials: "include", cache: "no-store" }),
        fetch("/api/superadmin/billing-summary", { credentials: "include", cache: "no-store" }),
      ]);
      if (a.ok) {
        const j = await a.json();
        setExpenses(j.expenses ?? []);
        setSummary(j.summary ?? null);
        setBudget(typeof j.budgetPen === "number" ? j.budgetPen : null);
        setBudgetByCategory(j.budgetByCategory ?? {});
        if (typeof j.fxRate === "number") setFxRate(j.fxRate);
      }
      if (b.ok) {
        const j = await b.json();
        setCosts({ totalMonthlyCost: j.totalMonthlyCost, avgGrossMargin: j.avgGrossMargin, tenants: j.tenants ?? [] });
      }
      if (c.ok) {
        const j = await c.json();
        setMrrPen(typeof j.mrrPEN === "number" ? j.mrrPEN : 0);
        setPayingTenants(typeof j.counts?.paid === "number" ? j.counts.paid : 0);
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

  return {
    expenses, summary, costs, budget, budgetByCategory, fxRate, mrrPen, payingTenants,
    loading, busy, err, setErr, load,
    addExpense, updateExpense, removeExpense, saveBudget, saveBudgetByCategory,
  };
}
