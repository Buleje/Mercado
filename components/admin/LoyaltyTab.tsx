"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Heart, Loader2, Search, Gift, Award, ArrowUpRight, NotebookPen, Save, DollarSign, Clock, Bell, Users2, Link, Copy, MessageSquare, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/erp";
import { csrfHeaders } from "@/lib/csrf-client";

type Tier = { name: string; minSpent: number; pointsMultiplier: number; color: string };

const TIER_COLORS: Record<string, string> = {
  bronce: "bg-[var(--data-warning-500)] text-white",
  plata: "bg-[var(--rule-mid)] text-white",
  oro: "bg-[var(--data-warning-500)] text-[var(--data-warning-500)]",
  diamante: "bg-[var(--data-info-500)] text-[var(--data-info-500)]",
};

export default function LoyaltyTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [redeemPts, setRedeemPts] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [privateNotes, setPrivateNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [creditInput, setCreditInput] = useState("");
  const [creditSaving, setCreditSaving] = useState(false);
  const [expirationPolicy, setExpirationPolicy] = useState<3 | 6 | 12 | 'never'>(6);
  const [referralCode, setReferralCode] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/customers?limit=100")
      .then(r => {
        if (!r.ok) return { data: [], cursor: null };
        const cursor = r.headers.get("X-Next-Cursor") ?? null;
        return r.json().then((data: Customer[]) => ({ data, cursor }));
      })
      .then(({ data, cursor }) => {
        if (active) {
          setCustomers(data.sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0)));
          setNextCursor(cursor);
          setLoading(false);
        }
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/customers?limit=100&cursor=${encodeURIComponent(nextCursor)}`);
      if (res.ok) {
        const cursor = res.headers.get("X-Next-Cursor") ?? null;
        const data: Customer[] = await res.json();
        setCustomers(prev => [...prev, ...data.sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0))]);
        setNextCursor(cursor);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const loadLoyalty = async (phone: string) => {
    const res = await fetch(`/api/loyalty/${encodeURIComponent(phone)}`);
    if (res.ok) {
      const data = await res.json();
      setSelected({ phone: data.phone, name: data.name, loyaltyPoints: data.loyaltyPoints ?? 0, loyaltyTier: data.loyaltyTier ?? 'bronce', totalSpent: data.totalSpent ?? 0, privateNotes: data.privateNotes, creditBalance: data.creditBalance });
      setPrivateNotes(data.privateNotes ?? "");
      if (data.tiers) setTiers(data.tiers);
      // Load referral data
      setReferralCode(data.referralCode ?? "");
      setReferredBy(data.referredBy ?? "");
      // Calculate how many customers this customer referred
      const referralData = customers.filter(c => c.referralCode && c.referralCode === data.referralCode);
      setReferralCount(referralData.length);
    }
  };

  const updateCredit = async () => {
    if (!selected || !selected.phone || !creditInput) return;
    const delta = Number(creditInput);
    if (isNaN(delta) || delta === 0) return;
    setCreditSaving(true);
    const res = await fetch(`/api/customers/${encodeURIComponent(selected.phone)}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ creditDelta: delta }),
    });
    if (res.ok) {
      const newBalance = (selected.creditBalance ?? 0) + delta;
      setSelected(prev => prev ? { ...prev, creditBalance: newBalance } : prev);
      setCreditInput("");
    }
    setCreditSaving(false);
  };

  const savePrivateNotes = async () => {
    if (!selected || !selected.phone) return;
    setNotesSaving(true);
    await fetch(`/api/customers/${encodeURIComponent(selected.phone)}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ privateNotes }),
    });
    setSelected(prev => prev ? { ...prev, privateNotes } : prev);
    setNotesSaving(false);
  };

  const redeem = async () => {
    if (!selected || !selected.phone || !redeemPts) return;
    const phone = selected.phone;
    const pts = Number(redeemPts);
    if (pts <= 0 || pts > selected.loyaltyPoints) return;
    const res = await fetch(`/api/loyalty/${encodeURIComponent(phone)}`, {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "redeem", points: pts }),
    });
    if (res.ok) {
      setRedeemPts("");
      loadLoyalty(phone);
      setCustomers(prev => prev.map(c => c.phone === phone ? { ...c, loyaltyPoints: c.loyaltyPoints - pts } : c));
    }
  };

  const filtered = search
    ? customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? "").includes(search))
    : customers;

  const totalPoints = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);
  const avgSpent = customers.length > 0 ? customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0) / customers.length : 0;

  const calculateExpiration = () => {
    if (!selected || expirationPolicy === 'never') return null;
    // Simulated last activity: assume it was 30 days ago for customers with points
    const lastActivity = new Date();
    lastActivity.setDate(lastActivity.getDate() - 30);
    const expirationDate = new Date(lastActivity);
    expirationDate.setMonth(expirationDate.getMonth() + expirationPolicy);
    const now = new Date();
    const daysRemaining = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = expirationPolicy * 30;
    const percentRemaining = (daysRemaining / totalDays) * 100;
    return { expirationDate, daysRemaining, percentRemaining };
  };

  const getExpirationColor = (daysRemaining: number) => {
    if (daysRemaining > 60) return 'bg-[var(--accent-soft)]';
    if (daysRemaining > 30) return 'bg-[var(--data-warning-500)]';
    return 'bg-[var(--data-error-500)]';
  };

  const generateReferralCode = async () => {
    if (!selected || !selected.phone) return;
    const namePart = selected.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    const numberPart = Math.floor(1000 + Math.random() * 9000);
    const code = `${namePart}${numberPart}`;

    const res = await fetch(`/api/customers/${encodeURIComponent(selected.phone)}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ referralCode: code }),
    });
    if (res.ok) {
      setReferralCode(code);
      setSelected(prev => prev ? { ...prev, referralCode: code } as Customer : prev);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(id);
      setTimeout(() => setCopiedMessage(null), 2000);
    });
  };

  const generateWhatsAppMessage = (customer: Customer) => {
    const points = customer.loyaltyPoints;
    const value = (points * 0.1).toFixed(2);
    return `${customer.name}, tienes ${points} puntos en Buleje. ¡Canjéalos en tu próxima compra! Valor: S/${value}`;
  };

  const openWhatsApp = (phone: string, message: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const notifyAll = () => {
    const messages = customers
      .filter(c => c.loyaltyPoints > 0)
      .map(c => `${c.name} (${c.phone}): ${generateWhatsAppMessage(c)}`)
      .join('\n\n');
    copyToClipboard(messages, 'bulk-notify');
  };

  if (loading) return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-56 bg-[var(--rule-soft)] dark:bg-surface rounded-lg" />
        <div className="h-8 w-32 bg-[var(--rule-soft)] dark:bg-surface rounded-lg" />
      </div>
      {/* Tier badges */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-6 w-20 bg-[var(--rule-soft)] dark:bg-surface rounded-full" />)}
      </div>
      {/* Search */}
      <div className="h-10 w-full max-w-sm bg-[var(--rule-soft)] dark:bg-surface rounded-xl" />
      {/* Customer rows */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="flex flex-wrap items-center gap-3">
            <div className="h-10 w-10 bg-[var(--rule-soft)] dark:bg-surface rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-[var(--rule-soft)] dark:bg-surface rounded w-1/3" />
              <div className="h-3 bg-[var(--rule-soft)] dark:bg-surface rounded w-1/4" />
            </div>
            <div className="h-5 w-16 bg-[var(--rule-soft)] dark:bg-surface rounded-full" />
            <div className="h-5 w-14 bg-[var(--rule-soft)] dark:bg-surface rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Heart className="h-6 w-6 text-primary" />Programa de Fidelización</SectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
            <select
              value={expirationPolicy}
              onChange={e => setExpirationPolicy(e.target.value === 'never' ? 'never' : Number(e.target.value) as 3 | 6 | 12)}
              className="px-3 py-1.5 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-xs font-medium"
            >
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
              <option value="never">Sin vencimiento</option>
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-9 pr-4 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm w-56" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Clientes", value: customers.length },
          { label: "Puntos Totales", value: totalPoints.toLocaleString() },
          { label: "Gasto Promedio", value: `S/${avgSpent.toFixed(0)}` },
          { label: "Diamante", value: customers.filter(c => c.loyaltyTier === "diamante").length },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 text-center">
            <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{s.value}</p>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-2 space-y-2 max-h-125 overflow-y-auto">
          {filtered.length === 0 && <p className="text-center text-[var(--text-tertiary)] py-8">No se encontraron clientes</p>}
          {filtered.map(c => (
            <button key={c.phone ?? c.id} onClick={() => c.phone && loadLoyalty(c.phone)} disabled={!c.phone} className={cn("w-full text-left flex items-center gap-3 p-3 rounded-lg border transition", selected?.phone === c.phone ? "border-primary bg-primary/5" : "border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card hover:bg-[var(--surface-alt)] dark:hover:bg-surface")}>
              <div className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase shrink-0", TIER_COLORS[c.loyaltyTier] ?? "bg-[var(--rule-soft)] text-[var(--text-secondary)]")}>{c.loyaltyTier}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground truncate">{c.name}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{c.phone}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-extrabold text-sm text-primary">{c.loyaltyPoints} pts</p>
                <p className="text-xs text-[var(--text-tertiary)]">S/{(c.totalSpent ?? 0).toFixed(0)}</p>
              </div>
            </button>
          ))}
          {nextCursor && !search && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2 text-xs font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition disabled:opacity-50"
            >
              {loadingMore ? "Cargando…" : "Cargar más clientes"}
            </button>
          )}
        </div>

        {/* Detail Panel */}
        <div className="space-y-6">
          {!selected ? (
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-8 text-center">
              <Award className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
              <p className="text-sm text-[var(--text-tertiary)]">Selecciona un cliente para ver detalles</p>
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 text-center">
                <div className={cn("inline-block px-4 py-1 rounded-full text-sm font-extrabold uppercase mb-3", TIER_COLORS[selected.loyaltyTier] ?? "bg-[var(--rule-soft)] text-[var(--text-secondary)]")}>{selected.loyaltyTier}</div>
                <p className="font-extrabold text-lg text-[var(--text-primary)] dark:text-foreground">{selected.name}</p>
                <p className="text-sm text-[var(--text-tertiary)]">{selected.phone}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 mt-4">
                  <div>
                    <p className="text-xl sm:text-2xl font-extrabold text-primary">{selected.loyaltyPoints}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Puntos</p>
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">S/{(selected.totalSpent ?? 0).toFixed(0)}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Gastado total</p>
                  </div>
                </div>
              </div>

              {/* Redeem */}
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-sm flex flex-wrap items-center gap-2"><Gift className="h-4 w-4 text-primary" />Canjear Puntos</h4>
                <p className="text-xs text-[var(--text-tertiary)]">1 punto = S/0.10 de descuento</p>
                <div className="flex flex-wrap gap-2">
                  <input type="number" value={redeemPts} onChange={e => setRedeemPts(e.target.value)} placeholder="Puntos a canjear" className="flex-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm" />
                  <button onClick={redeem} disabled={!redeemPts || Number(redeemPts) <= 0 || Number(redeemPts) > selected.loyaltyPoints} className="px-2 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50">
                    Canjear
                  </button>
                </div>
                {redeemPts && Number(redeemPts) > 0 && (
                  <p className="text-xs text-[var(--data-success-500)] flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />Descuento: S/{(Number(redeemPts) * 0.1).toFixed(2)}</p>
                )}
              </div>

              {/* Private Notes */}
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-sm flex flex-wrap items-center gap-2"><NotebookPen className="h-4 w-4 text-primary" />Notas Privadas</h4>
                <textarea
                  value={privateNotes}
                  onChange={e => setPrivateNotes(e.target.value)}
                  rows={3}
                  placeholder="Notas internas sobre este cliente (no visibles para el cliente)…"
                  className="w-full px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm resize-none"
                />
                <button
                  onClick={savePrivateNotes}
                  disabled={notesSaving || privateNotes === (selected.privateNotes ?? "")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {notesSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Guardar notas
                </button>
              </div>

              {/* Credit Balance */}
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-sm flex flex-wrap items-center gap-2"><DollarSign className="h-4 w-4 text-primary" />Saldo a Favor</h4>
                <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)]">S/{(selected.creditBalance ?? 0).toFixed(2)}</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="+ agregar  /  - deducir"
                    value={creditInput}
                    onChange={e => setCreditInput(e.target.value)}
                    className="flex-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm"
                  />
                  <button
                    onClick={updateCredit}
                    disabled={!creditInput || creditSaving}
                    className="px-2 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    {creditSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
                  </button>
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">Ingresa monto positivo para agregar saldo, negativo para deducir.</p>
              </div>

              {/* Point Expiration */}
              {selected.loyaltyPoints > 0 && expirationPolicy !== 'never' && (() => {
                const expiration = calculateExpiration();
                if (!expiration) return null;
                const { expirationDate, daysRemaining, percentRemaining } = expiration;
                return (
                  <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3">
                    <h4 className="font-bold text-sm flex flex-wrap items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      Vencimiento de Puntos
                    </h4>
                    {daysRemaining < 30 && (
                      <div className="flex flex-wrap items-start gap-2 p-2 bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />
                        <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">Los puntos vencen pronto</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] dark:text-muted mb-2">
                        Tus puntos vencen el <span className="font-bold">{expirationDate.toLocaleDateString('es-PE')}</span>
                      </p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                          <span>{daysRemaining} días restantes</span>
                          <span>{Math.round(percentRemaining)}%</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--rule-soft)] dark:bg-surface rounded-full overflow-hidden">
                          <div
                            className={cn("h-full transition-all", getExpirationColor(daysRemaining))}
                            style={{ width: `${Math.min(100, Math.max(0, percentRemaining))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Notification Panel */}
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm flex flex-wrap items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    Notificaciones de Puntos
                  </h4>
                  <button
                    onClick={notifyAll}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition"
                  >
                    {copiedMessage === 'bulk-notify' ? (
                      <>Copiado</>
                    ) : (
                      <>
                        <MessageSquare className="h-3 w-3" />
                        Notificar a todos
                      </>
                    )}
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {customers.filter(c => c.loyaltyPoints > 0 && c.phone).slice(0, 5).map(c => (
                    <div key={c.phone} className="flex items-center justify-between p-2 bg-[var(--surface-alt)] dark:bg-surface rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{c.loyaltyPoints} pts · S/{(c.loyaltyPoints * 0.1).toFixed(2)}</p>
                      </div>
                      <button
                        onClick={() => c.phone && openWhatsApp(c.phone, generateWhatsAppMessage(c))}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-white bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] rounded-lg transition shrink-0"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Enviar
                      </button>
                    </div>
                  ))}
                  {customers.filter(c => c.loyaltyPoints > 0).length === 0 && (
                    <p className="text-xs text-[var(--text-tertiary)] text-center py-4">No hay clientes con puntos activos</p>
                  )}
                </div>
              </div>

              {/* Referral Program */}
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-sm flex flex-wrap items-center gap-2">
                  <Users2 className="h-4 w-4 text-primary" />
                  Programa de Referidos
                </h4>
                
                {referralCode ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-1">Tu código de referido</p>
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-extrabold text-primary">{referralCode}</p>
                        <button
                          onClick={() => copyToClipboard(referralCode, 'referral-code')}
                          className="p-1.5 hover:bg-primary/10 rounded transition"
                        >
                          {copiedMessage === 'referral-code' ? (
                            <span className="text-xs text-[var(--data-success-500)] font-bold">OK</span>
                          ) : (
                            <Copy className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="text-center p-2 bg-[var(--surface-alt)] dark:bg-surface rounded-lg">
                        <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{referralCount}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Referidos</p>
                      </div>
                      <div className="text-center p-2 bg-[var(--surface-alt)] dark:bg-surface rounded-lg">
                        <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{customers.filter(c => c.referralCode).length}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Total sistema</p>
                      </div>
                    </div>

                    {referredBy && (
                      <div className="p-2 bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-lg">
                        <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                          <span className="font-bold">Referido por:</span> {referredBy}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-xs text-[var(--text-secondary)]">Mensaje para compartir:</p>
                      <div className="p-2 bg-[var(--surface-alt)] dark:bg-surface rounded-lg relative">
                        <p className="text-xs text-[var(--text-secondary)]">
                          ¡Únete a Buleje con mi código <span className="font-bold text-primary">{referralCode}</span>!
                        </p>
                        <button
                          onClick={() => copyToClipboard(`¡Únete a Buleje con mi código ${referralCode}!`, 'referral-message')}
                          className="absolute top-2 right-2 p-1 hover:bg-[var(--rule-soft)] dark:hover:bg-card rounded transition"
                        >
                          {copiedMessage === 'referral-message' ? (
                            <span className="text-xs text-[var(--data-success-500)] font-bold">OK</span>
                          ) : (
                            <Copy className="h-3 w-3 text-[var(--text-tertiary)]" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Link className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                    <p className="text-xs text-[var(--text-tertiary)] mb-3">Este cliente aún no tiene código de referido</p>
                    <button
                      onClick={generateReferralCode}
                      className="px-2 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition"
                    >
                      Generar código
                    </button>
                  </div>
                )}
              </div>

              {/* Tiers */}
              {tiers.length > 0 && (
                <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-2">
                  <h4 className="font-bold text-sm">Niveles</h4>
                  {tiers.map(t => (
                    <div key={t.name} className={cn("flex items-center justify-between text-xs px-3 py-2 rounded-lg", selected.loyaltyTier === t.name ? "bg-primary/10 border border-primary" : "bg-[var(--surface-alt)] dark:bg-surface")}>
                      <span className="font-bold capitalize">{t.name}</span>
                      <span>S/{t.minSpent}+ gastado</span>
                      <span className="font-bold">{t.pointsMultiplier}x puntos</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

