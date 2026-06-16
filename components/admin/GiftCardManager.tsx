"use client";
 

import { useState, useEffect, useCallback } from "react";
import { Field } from "@/components/admin/shared/Field";
import { Gift, Plus, Check, Copy, Search, Tag, Clock, AlertCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type GiftCardStatus = "activo" | "usado" | "vencido";

interface GiftCard {
  id: string;
  code: string;
  amount: number;
  recipientName: string;
  message: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  status: GiftCardStatus;
  balance: number;
}

type ActiveTab = "lista" | "crear" | "canjear";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bodega_gift_cards";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function loadCards(): GiftCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const cards: GiftCard[] = JSON.parse(raw);
    // Update expired status
    const now = new Date();
    return cards.map((c) => ({
      ...c,
      status: c.status === "usado" ? "usado" : new Date(c.expiresAt) < now ? "vencido" : "activo",
    }));
  } catch { return []; }
}

function saveCards(cards: GiftCard[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

// ── Simple QR-like visual (ASCII pattern representation) ─────────────────────

function QRVisual({ code }: { code: string }) {
  // Deterministic grid based on code characters
  const grid: boolean[][] = [];
  for (let r = 0; r < 10; r++) {
    grid[r] = [];
    for (let c = 0; c < 10; c++) {
      const charCode = code.charCodeAt((r * 10 + c) % code.length);
      grid[r][c] = ((charCode + r * 3 + c * 7) % 3) !== 0;
    }
  }
  // Finder patterns (corners forced)
  [[0,0],[0,1],[1,0],[0,8],[0,9],[1,9],[8,0],[9,0],[9,1],[8,9],[9,8],[9,9]].forEach(([r,c]) => {
    if (grid[r]) grid[r][c] = true;
  });

  return (
    <div className="inline-block p-2 bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)]">
      <div className="grid" style={{ gridTemplateColumns: "repeat(10, 1fr)", gap: "1px" }}>
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              className={cn("w-4 h-4 rounded-sm", cell ? "bg-gray-900" : "bg-white dark:bg-[var(--color-card)]")}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── GiftCard visual card ───────────────────────────────────────────────────────

function GiftCardDisplay({ card }: { card: GiftCard }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    // Clipboard write puede fallar si el browser bloquea (Safari sin focus
    // del documento, iframe sin permission). Best-effort intencional: el
    // botón se ve como "copiado" igual y si falla solo el usuario sabe.
    await navigator.clipboard.writeText(card.code).catch(() => { /* clipboard best-effort */ });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-xl overflow-hidden p-5 text-white"
      style={{ background: "linear-gradient(135deg, #1a3a2a 0%, var(--accent) 50%, #1a3a2a 100%)" }}>
      {/* Gold border accent */}
      <div className="absolute inset-0 rounded-xl pointer-events-none"
        style={{ border: "2px solid rgba(244,162,97,0.5)" }} />

      {/* Decorative circles */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10"
        style={{ background: "#f97316" }} />
      <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full opacity-10"
        style={{ background: "#f97316" }} />

      <div className="relative flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Gift className="h-4 w-4 text-secondary" />
            <span className="text-xs font-semibold text-secondary">Vale de Compra</span>
          </div>
          <p className="text-2xl font-extrabold">{fmt(card.balance)}</p>
          <p className="text-xs text-white/60 mt-0.5">de {fmt(card.amount)} original</p>
        </div>
        <QRVisual code={card.code} />
      </div>

      <div className="border-t border-white/10 pt-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/60">Para</span>
          <span className="text-sm font-semibold">{card.recipientName}</span>
        </div>
        {card.message && (
          <p className="text-xs text-white/70 italic truncate">&ldquo;{card.message}&rdquo;</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <button type="button" onClick={copy}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono font-bold tracking-widest transition-colors">
            {card.code}
            {copied ? <Check className="h-3 w-3 text-[var(--data-success-500)]" /> : <Copy className="h-3 w-3 opacity-60" />}
          </button>
          <span className="text-xs text-white/50">Vence: {fmtDate(card.expiresAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GiftCardManager() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("lista");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<GiftCardStatus | "todos">("todos");

  // Create form
  const [createAmount, setCreateAmount] = useState("");
  const [createRecipient, setCreateRecipient] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [createMonths, setCreateMonths] = useState("6");
  const [justCreated, setJustCreated] = useState<GiftCard | null>(null);

  // Redeem
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeemResult, setRedeemResult] = useState<{ success: boolean; msg: string } | null>(null);

  useEffect(() => {
    setCards(loadCards());
  }, []);

  const persist = useCallback((updated: GiftCard[]) => {
    setCards(updated);
    saveCards(updated);
  }, []);

  // Create
  const handleCreate = () => {
    const amount = parseFloat(createAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (!createRecipient.trim()) return;

    const months = parseInt(createMonths, 10) || 6;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const card: GiftCard = {
      id: Date.now().toString(),
      code: generateCode(),
      amount,
      balance: amount,
      recipientName: createRecipient.trim(),
      message: createMessage.trim(),
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "activo",
    };

    const updated = [card, ...cards];
    persist(updated);
    setJustCreated(card);
    setCreateAmount("");
    setCreateRecipient("");
    setCreateMessage("");
  };

  // Redeem
  const handleRedeem = () => {
    const amount = parseFloat(redeemAmount);
    if (isNaN(amount) || amount <= 0) {
      setRedeemResult({ success: false, msg: "Ingresa un monto valido" });
      return;
    }

    const idx = cards.findIndex((c) => c.code === redeemCode.trim().toUpperCase());
    if (idx === -1) {
      setRedeemResult({ success: false, msg: "Codigo no encontrado" });
      return;
    }

    const card = cards[idx];
    if (card.status === "vencido") {
      setRedeemResult({ success: false, msg: "Este vale esta vencido" });
      return;
    }
    if (card.status === "usado") {
      setRedeemResult({ success: false, msg: "Este vale ya fue usado" });
      return;
    }
    if (card.balance < amount) {
      setRedeemResult({ success: false, msg: `Saldo insuficiente. Disponible: ${fmt(card.balance)}` });
      return;
    }

    const newBalance = card.balance - amount;
    const updated = [...cards];
    updated[idx] = {
      ...card,
      balance: newBalance,
      status: newBalance === 0 ? "usado" : "activo",
      usedAt: newBalance === 0 ? new Date().toISOString() : card.usedAt,
    };
    persist(updated);
    setRedeemResult({ success: true, msg: `Descontado ${fmt(amount)}. Saldo restante: ${fmt(newBalance)}` });
    setRedeemCode("");
    setRedeemAmount("");
  };

  // Filter
  const filteredCards = cards.filter((c) => {
    const matchSearch = !search || c.code.includes(search.toUpperCase()) || c.recipientName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusLabel: Record<GiftCardStatus, string> = { activo: "Activo", usado: "Usado", vencido: "Vencido" };
  const statusColor: Record<GiftCardStatus, string> = {
    activo: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
    usado: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]",
    vencido: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]",
  };

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: "lista", label: "Vales" },
    { key: "crear", label: "Crear vale" },
    { key: "canjear", label: "Canjear" },
  ];

  return (
    <div className="rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)]/50">
        <Gift className="h-4 w-4 text-secondary" />
        <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Gift Cards y Vales</span>
        <span className="ml-auto text-xs font-medium text-[var(--text-tertiary)]">{cards.filter(c => c.status === "activo").length} activos</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setActiveTab(tab.key); setJustCreated(null); setRedeemResult(null); }}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold transition-colors",
              activeTab === tab.key
                ? "text-primary border-b-2 border-primary"
                : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ── Lista ── */}
        {activeTab === "lista" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por codigo o nombre..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary" />
              </div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as GiftCardStatus | "todos")}
                className="px-2 py-2 text-xs rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary">
                <option value="todos">Todos</option>
                <option value="activo">Activos</option>
                <option value="usado">Usados</option>
                <option value="vencido">Vencidos</option>
              </select>
            </div>

            {filteredCards.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
                <Gift className="h-8 w-8" />
                <p className="text-sm">Sin vales todavia</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCards.map((card) => (
                  <div key={card.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: card.status === "activo" ? "rgba(244,162,97,0.15)" : "rgba(156,163,175,0.1)" }}>
                      <Gift className={cn("h-4 w-4", card.status === "activo" ? "text-secondary" : "text-[var(--text-tertiary)]")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{card.code}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", statusColor[card.status])}>
                          {statusLabel[card.status]}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted truncate">{card.recipientName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary">{fmt(card.balance)}</p>
                      <div className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                        <Clock className="h-3 w-3" />
                        {fmtDate(card.expiresAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Crear ── */}
        {activeTab === "crear" && (
          <div className="space-y-6">
            {justCreated ? (
              <div className="space-y-6">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                  <Check className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
                  <p className="text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-medium">Vale creado exitosamente</p>
                </div>
                <GiftCardDisplay card={justCreated} />
                <button type="button" onClick={() => setJustCreated(null)}
                  className="w-full py-2 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-secondary)] dark:text-muted hover:border-gray-300 transition-colors">
                  Crear otro vale
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <Field label="Monto del vale" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
                    {(id) => (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--text-secondary)]">S/</span>
                        <input id={id} type="number" min="1" step="0.50" value={createAmount} onChange={(e) => setCreateAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-8 pr-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary" />
                      </div>
                    )}
                  </Field>

                  <Field label="Para quien" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
                    <input type="text" value={createRecipient} onChange={(e) => setCreateRecipient(e.target.value)}
                      placeholder="Nombre del destinatario"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary" />
                  </Field>

                  <Field label="Mensaje (opcional)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
                    <input type="text" value={createMessage} onChange={(e) => setCreateMessage(e.target.value)}
                      placeholder="Feliz cumpleanos, con carino..."
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary" />
                  </Field>

                  <Field label="Valido por" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
                    <select value={createMonths} onChange={(e) => setCreateMonths(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary">
                      <option value="1">1 mes</option>
                      <option value="3">3 meses</option>
                      <option value="6">6 meses</option>
                      <option value="12">1 ano</option>
                    </select>
                  </Field>
                </div>

                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!createAmount || !createRecipient.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Generar vale
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Canjear ── */}
        {activeTab === "canjear" && (
          <div className="space-y-3">
            <Field label="Codigo del vale" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
              <input type="text" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                maxLength={8}
                className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary tracking-widest uppercase" />
            </Field>

            <Field label="Monto a descontar" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
              {(id) => (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--text-secondary)]">S/</span>
                  <input id={id} type="number" min="0.01" step="0.01" value={redeemAmount} onChange={(e) => setRedeemAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary" />
                </div>
              )}
            </Field>

            {/* Preview card */}
            {redeemCode.length === 8 && (() => {
              const found = cards.find((c) => c.code === redeemCode);
              if (!found) return null;
              return (
                <div className="px-3 py-2.5 rounded-xl bg-[var(--surface-canvas)]/50 border border-[var(--rule-soft)] dark:border-[var(--rule-base)] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)] dark:text-muted">Para</span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{found.recipientName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)] dark:text-muted">Saldo disponible</span>
                    <span className="text-sm font-bold text-primary">{fmt(found.balance)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)] dark:text-muted">Estado</span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", statusColor[found.status])}>
                      {statusLabel[found.status]}
                    </span>
                  </div>
                </div>
              );
            })()}

            {redeemResult && (
              <div className={cn("flex items-start gap-2 px-3 py-2.5 rounded-xl border", redeemResult.success ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30" : "bg-[var(--data-error-50)] dark:bg-red-950/20 border-[var(--data-error-500)] dark:border-[var(--data-error-500)]")}>
                {redeemResult.success
                  ? <Check className="h-4 w-4 text-[var(--data-success-500)] shrink-0 mt-0.5" />
                  : <AlertCircle className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />}
                <p className={cn("text-sm", redeemResult.success ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]")}>
                  {redeemResult.msg}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleRedeem}
              disabled={redeemCode.length !== 8 || !redeemAmount}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <Tag className="h-4 w-4" />
              Canjear vale
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
