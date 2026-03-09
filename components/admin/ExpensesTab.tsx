"use client";

import { useState, useEffect } from "react";
import { Wallet, Loader2, Plus, Trash2, Calendar, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Expense = { id: string; category: string; description: string; amount: number; date: string; recurring: boolean };
type Summary = { category: string; total: number; count: number };

const CATEGORIES = [
  { value: "alquiler", label: "Alquiler", emoji: "🏠" },
  { value: "servicios", label: "Servicios", emoji: "💡" },
  { value: "personal", label: "Personal", emoji: "👥" },
  { value: "transporte", label: "Transporte", emoji: "🚚" },
  { value: "limpieza", label: "Limpieza", emoji: "🧹" },
  { value: "marketing", label: "Marketing", emoji: "📢" },
  { value: "mantenimiento", label: "Mantenimiento", emoji: "🔧" },
  { value: "otros", label: "Otros", emoji: "📋" },
];

const catEmoji = (cat: string) => CATEGORIES.find(c => c.value === cat)?.emoji ?? "📋";

export default function ExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);

  // filters
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  // form
  const [form, setForm] = useState({ category: "otros", description: "", amount: "", date: new Date().toISOString().slice(0, 10), recurring: false });

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/expenses?from=${from}&to=${to}`).then(r => r.ok ? r.json() : []),
      fetch("/api/expenses/summary").then(r => r.ok ? r.json() : []),
    ]).then(([exp, sum]) => {
      if (active) {
        setExpenses(exp);
        setSummary(sum);
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, tick]);

  const add = async () => {
    if (!form.description || !form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    if (res.ok) {
      setForm({ category: "otros", description: "", amount: "", date: new Date().toISOString().slice(0, 10), recurring: false });
      setShowForm(false);
      setTick(v => v + 1);
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    setTick(v => v + 1);
  };

  const totalPeriod = expenses.reduce((s, e) => s + e.amount, 0);
  const totalAll = summary.reduce((s, item) => s + item.total, 0);
  const maxCat = summary.length > 0 ? summary.reduce((a, b) => a.total > b.total ? a : b) : null;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" />Control de Gastos</h2>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition flex items-center gap-2"><Plus className="h-4 w-4" />Nuevo Gasto</button>
      </div>

      {/* Date filter + stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-2 flex items-center gap-2 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3">
          <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-transparent text-sm flex-1 min-w-0" />
          <span className="text-gray-300">→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-transparent text-sm flex-1 min-w-0" />
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-extrabold text-red-600">S/{totalPeriod.toFixed(2)}</p>
          <p className="text-xs text-gray-400">Este periodo</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">S/{totalAll.toFixed(2)}</p>
          <p className="text-xs text-gray-400">Total histórico</p>
        </div>
      </div>

      {/* Category summary */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summary.map(s => (
            <div key={s.category} className={cn("bg-white dark:bg-card border rounded-2xl p-3 text-center", s.category === maxCat?.category ? "border-red-300 dark:border-red-700" : "border-gray-200 dark:border-card-border")}>
              <span className="text-2xl">{catEmoji(s.category)}</span>
              <p className="font-extrabold text-sm text-gray-900 dark:text-foreground">S/{s.total.toFixed(0)}</p>
              <p className="text-[10px] text-gray-400 capitalize">{s.category} ({s.count})</p>
              {totalAll > 0 && <div className="mt-1 h-1 bg-gray-100 dark:bg-surface rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(s.total / totalAll) * 100}%` }} /></div>}
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-card rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg">Registrar Gasto</h3>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
            </select>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción del gasto" className="w-full px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            <div className="flex gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
              </div>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))} className="rounded" />
              Gasto recurrente (mensual)
            </label>
            <button onClick={add} disabled={saving || !form.description || !form.amount} className="w-full py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Guardar Gasto
            </button>
          </div>
        </div>
      )}

      {/* Expenses list */}
      {expenses.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900 dark:text-foreground">Sin gastos registrados</p>
          <p className="text-sm text-gray-400">Agrega un gasto para empezar</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-100 overflow-y-auto">
          {expenses.map(e => (
            <div key={e.id} className="flex items-center gap-3 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl px-4 py-3">
              <span className="text-xl">{catEmoji(e.category)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 dark:text-foreground truncate">{e.description}</p>
                <p className="text-xs text-gray-400">{new Date(e.date).toLocaleDateString("es-PE")} · <span className="capitalize">{e.category}</span>{e.recurring && " · 🔄 Recurrente"}</p>
              </div>
              <p className="font-extrabold text-red-600 shrink-0">-S/{e.amount.toFixed(2)}</p>
              <button onClick={() => remove(e.id)} className="text-gray-300 hover:text-red-500 transition"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
