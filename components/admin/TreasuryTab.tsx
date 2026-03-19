"use client";

import { useState, useCallback } from "react";
import {
  Landmark, Plus, X, RefreshCw, Download, TrendingUp, TrendingDown,
  ArrowLeftRight, CheckCircle, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type BankAccount = {
  id: string;
  name: string;           // "BCP Cuenta Corriente"
  bank: string;
  accountNumber: string;  // masked
  currency: string;
  balance: number;
  color: string;
};

type BankTransaction = {
  id: string;
  accountId: string;
  date: string;
  description: string;
  type: "credito" | "debito";
  amount: number;
  category: string;
  reconciled: boolean;
};

const BANKS = ["BCP","BBVA","Interbank","Scotiabank","BanBif","Mibanco","Otro"];
const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899"];

function fmt(n: number) {
  return `S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// Seed data
const SEED_ACCOUNTS: BankAccount[] = [];

const SEED_TXN: BankTransaction[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TreasuryTab() {
  const [accounts, setAccounts] = useState<BankAccount[]>(SEED_ACCOUNTS);
  const [transactions, setTransactions] = useState<BankTransaction[]>(SEED_TXN);
  const [selectedAcc, setSelectedAcc] = useState<string | null>(null);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewTxn, setShowNewTxn] = useState(false);
  const [hideBalances, setHideBalances] = useState(false);
  const [accForm, setAccForm] = useState({ name: "", bank: "BCP", accountNumber: "", balance: "", color: COLORS[0] });
  const [txnForm, setTxnForm] = useState({ accountId: accounts[0]?.id ?? "", date: new Date().toISOString().slice(0, 10), description: "", type: "credito", amount: "", category: "ventas" });

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const visibleTxn = selectedAcc ? transactions.filter(t => t.accountId === selectedAcc) : transactions;
  const totalCredits = visibleTxn.filter(t => t.type === "credito").reduce((s, t) => s + t.amount, 0);
  const totalDebits = visibleTxn.filter(t => t.type === "debito").reduce((s, t) => s + t.amount, 0);
  const unreconciled = transactions.filter(t => !t.reconciled).length;

  const handleCreateAccount = () => {
    if (!accForm.name.trim() || !accForm.balance) return;
    const n: BankAccount = { id: `acc-${Date.now()}`, name: accForm.name, bank: accForm.bank, accountNumber: accForm.accountNumber || "•••• ????", currency: "PEN", balance: parseFloat(accForm.balance), color: accForm.color };
    setAccounts(prev => [...prev, n]);
    setAccForm({ name: "", bank: "BCP", accountNumber: "", balance: "", color: COLORS[0] });
    setShowNewAccount(false);
  };

  const handleCreateTxn = () => {
    if (!txnForm.description.trim() || !txnForm.amount) return;
    const amount = parseFloat(txnForm.amount);
    const t: BankTransaction = { id: `t-${Date.now()}`, accountId: txnForm.accountId, date: txnForm.date, description: txnForm.description, type: txnForm.type as "credito" | "debito", amount, category: txnForm.category, reconciled: false };
    setTransactions(prev => [...prev, t]);
    // Update account balance
    setAccounts(prev => prev.map(a => {
      if (a.id !== txnForm.accountId) return a;
      return { ...a, balance: a.balance + (txnForm.type === "credito" ? amount : -amount) };
    }));
    setTxnForm(p => ({ ...p, description: "", amount: "" }));
    setShowNewTxn(false);
  };

  const toggleReconcile = (id: string) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, reconciled: !t.reconciled } : t));
  };

  const handleExport = () => {
    exportToCSV(visibleTxn.map(t => ({
      fecha: t.date,
      cuenta: accounts.find(a => a.id === t.accountId)?.name ?? t.accountId,
      descripcion: t.description,
      tipo: t.type,
      categoria: t.category,
      monto: t.type === "credito" ? t.amount : -t.amount,
      conciliado: t.reconciled ? "Sí" : "No",
    })), "tesoreria-movimientos");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" />
            Tesorería &amp; Bancos
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Gestión de cuentas bancarias, saldos y movimientos</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setHideBalances(v => !v)} className="p-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors" title={hideBalances ? "Mostrar saldos" : "Ocultar saldos"}>
            {hideBalances ? <EyeOff className="h-4 w-4 text-gray-500 dark:text-muted" /> : <Eye className="h-4 w-4 text-gray-500 dark:text-muted" />}
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowNewAccount(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Cuenta
          </button>
        </div>
      </div>

      {/* Total saldo consolidado */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/5 border border-primary/20 rounded-2xl p-6">
        <p className="text-sm font-semibold text-primary/70 mb-1">Saldo consolidado total</p>
        <p className="text-4xl font-extrabold text-primary">
          {hideBalances ? "S/ ••••••" : fmt(totalBalance)}
        </p>
        <p className="text-xs text-primary/60 mt-1">{accounts.length} cuentas activas · {unreconciled} movimiento{unreconciled !== 1 ? "s" : ""} sin conciliar</p>
      </div>

      {/* Account cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <button
            key={acc.id}
            onClick={() => setSelectedAcc(selectedAcc === acc.id ? null : acc.id)}
            className={cn("text-left rounded-2xl border p-4 transition-all hover:shadow-md", selectedAcc === acc.id ? "border-primary shadow-sm ring-1 ring-primary/30" : "border-gray-200 dark:border-card-border bg-white dark:bg-card")}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-extrabold" style={{ backgroundColor: acc.color }}>
                  {acc.bank.slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-foreground leading-tight">{acc.name}</p>
                  <p className="text-xs text-gray-400 dark:text-muted">{acc.accountNumber}</p>
                </div>
              </div>
            </div>
            <p className="text-2xl font-extrabold" style={{ color: acc.color }}>
              {hideBalances ? "••••••" : fmt(acc.balance)}
            </p>
            <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{acc.currency}</p>
          </button>
        ))}

        {/* Add account card */}
        <button
          onClick={() => setShowNewAccount(v => !v)}
          className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-card-border p-4 hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-accent/30 transition-all flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-muted min-h-[100px]"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-semibold">Agregar cuenta</span>
        </button>
      </div>

      {/* New account form */}
      {showNewAccount && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-foreground text-sm">Nueva cuenta bancaria</h3>
            <button onClick={() => setShowNewAccount(false)}><X className="h-4 w-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Nombre</label>
              <input type="text" value={accForm.name} onChange={e => setAccForm(p => ({ ...p, name: e.target.value }))} placeholder="BCP Cuenta Corriente" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Banco</label>
              <select value={accForm.bank} onChange={e => setAccForm(p => ({ ...p, bank: e.target.value }))} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Número (últimos 4)</label>
              <input type="text" value={accForm.accountNumber} onChange={e => setAccForm(p => ({ ...p, accountNumber: e.target.value }))} placeholder="•••• 0000" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Saldo actual (S/)</label>
              <input type="number" value={accForm.balance} onChange={e => setAccForm(p => ({ ...p, balance: e.target.value }))} placeholder="0.00" min="0" step="0.01" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Color</label>
              <div className="flex gap-1.5 mt-1">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setAccForm(p => ({ ...p, color: c }))} className={cn("w-7 h-7 rounded-full border-2 transition-all", accForm.color === c ? "border-gray-700" : "border-transparent")} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNewAccount(false)} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted">Cancelar</button>
            <button onClick={handleCreateAccount} className="px-4 py-2 text-sm rounded-xl bg-primary text-white font-semibold hover:bg-primary/90">Agregar</button>
          </div>
        </div>
      )}

      {/* Transactions section */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-card-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-gray-900 dark:text-foreground text-sm">
              Movimientos {selectedAcc ? `— ${accounts.find(a => a.id === selectedAcc)?.name}` : "— Todas las cuentas"}
            </h2>
            {selectedAcc && (
              <button onClick={() => setSelectedAcc(null)} className="text-xs text-primary hover:underline">Ver todas</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-600"><TrendingUp className="h-3.5 w-3.5" />{fmt(totalCredits)}</span>
              <span className="flex items-center gap-1 text-red-500"><TrendingDown className="h-3.5 w-3.5" />{fmt(totalDebits)}</span>
            </div>
            <button onClick={() => setShowNewTxn(v => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> Movimiento
            </button>
          </div>
        </div>

        {/* New transaction inline form */}
        {showNewTxn && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-surface/40 border-b border-gray-100 dark:border-card-border">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Cuenta</label>
                <select value={txnForm.accountId} onChange={e => setTxnForm(p => ({ ...p, accountId: e.target.value }))} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Tipo</label>
                <select value={txnForm.type} onChange={e => setTxnForm(p => ({ ...p, type: e.target.value }))} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
                  <option value="credito">Crédito (+)</option>
                  <option value="debito">Débito (−)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Descripción</label>
                <input type="text" value={txnForm.description} onChange={e => setTxnForm(p => ({ ...p, description: e.target.value }))} placeholder="Concepto..." className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Monto</label>
                <input type="number" value={txnForm.amount} onChange={e => setTxnForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" min="0" step="0.01" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
              </div>
              <div className="flex items-end gap-2">
                <button onClick={handleCreateTxn} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90">Registrar</button>
                <button onClick={() => setShowNewTxn(false)} className="p-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-400 hover:bg-gray-100 dark:hover:bg-accent"><X className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
            <tr>
              <th className="text-left px-6 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase">Fecha</th>
              <th className="text-left px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase">Descripción</th>
              <th className="text-left px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase hidden sm:table-cell">Cuenta</th>
              <th className="text-left px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase hidden sm:table-cell">Categoría</th>
              <th className="text-right px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase">Monto</th>
              <th className="text-center px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase hidden sm:table-cell">Conc.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-card-border">
            {visibleTxn.sort((a, b) => b.date.localeCompare(a.date)).map(t => (
              <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                <td className="px-6 py-3 text-gray-500 dark:text-muted text-xs">{fmtDate(t.date)}</td>
                <td className="px-4 py-3 text-gray-800 dark:text-foreground">{t.description}</td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-muted hidden sm:table-cell">
                  <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: accounts.find(a => a.id === t.accountId)?.color ?? "#999" }} />
                  {accounts.find(a => a.id === t.accountId)?.name ?? t.accountId}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-surface capitalize text-gray-600 dark:text-muted">{t.category}</span>
                </td>
                <td className={cn("px-4 py-3 text-right font-bold", t.type === "credito" ? "text-emerald-600" : "text-red-500")}>
                  {t.type === "credito" ? "+" : "−"}{fmt(t.amount)}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <button onClick={() => toggleReconcile(t.id)} title={t.reconciled ? "Conciliado" : "Marcar como conciliado"}>
                    {t.reconciled
                      ? <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                      : <div className="h-4 w-4 rounded-full border-2 border-gray-300 dark:border-muted mx-auto hover:border-primary transition-colors" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleTxn.length === 0 && <p className="text-center py-8 text-gray-400 dark:text-muted text-sm">Sin movimientos.</p>}
      </div>
    </div>
  );
}
