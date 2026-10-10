"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SectionTitle } from "@buleje/design-system";
import { Ticket, Plus, Trash2, Check, X, Copy, Sparkles, MessageCircle, Calendar, MoreHorizontal, Search } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { Field } from "@/components/admin/shared/Field";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Cupones } from "@/components/admin/cupones/hooks/use-cupones";

const LIMITE_CUPONES = 10;

/** Cupones creados a mano: cabecera, formulario y lista. Pieza de CouponsTab: recibe `useCupones` entero. */
export default function CuponesManuales({ cup }: { cup: Cupones }) {
  const {
    coupons, showForm, setShowForm, couponScope, setCouponScope, form, setForm, setWhatsappCoupon,
    setWhatsappPhone, handleCreate, toggleActive, handleDelete, copyWhatsappMsg, setShowTemplateBuilder,
  } = cup;
  // Filtro pegado a la lista (ley de la vista): busca por código o descripción.
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const visibles = q ? coupons.filter((c) => c.code.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)) : coupons;
  const activos = coupons.filter((c) => c.active).length;
  // ≤ 2,5 pantallas: de entrada se ven los primeros 10; buscar o «Ver todos» muestra el resto.
  const [verTodos, setVerTodos] = useState(false);
  const lista = verTodos || q ? visibles : visibles.slice(0, LIMITE_CUPONES);
  return (
    <>
      {/* ── Cabecera en una fila: título + ⓘ, «Nuevo cupón» y lo demás en «Más acciones» ── */}
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="flex items-center gap-2 text-[var(--text-primary)]"><Ticket className="h-6 w-6 text-primary" aria-hidden />Cupones</SectionTitle>
        <InfoTip
          title="Cupones"
          what="Códigos que el cliente escribe al pagar para llevarse un descuento: porcentaje o monto fijo, con compra mínima, tope de usos y vencimiento."
          affects="«De mi tienda» vale sólo aquí; «de plataforma», en todo el marketplace. Desactivar un cupón lo frena para compras nuevas sin borrarlo."
          example="DESCUENTO10: 10 % en compras desde S/ 30, máximo 50 usos, vence el viernes 31/10."
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            aria-expanded={showForm}
            aria-label="Nuevo cupón"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary/90 sm:px-4"
          >
            <Plus className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Nuevo cupón</span>
          </button>
          <ActionMenu
            label="Más acciones"
            soloIcono
            icon={MoreHorizontal}
            actions={[
              { id: "plantilla", label: "Plantilla de código", hint: "Arma códigos como BDAY1009K7Q para las reglas", icon: Calendar, onSelect: () => setShowTemplateBuilder(true) },
            ]}
          />
        </div>
      </div>

      {showForm && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 space-y-4">
          {/* Scope toggle: Tienda vs Plataforma */}
          <div>
            <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2 block">Alcance del cupón</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCouponScope("tienda")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px]",
                  couponScope === "tienda"
                    ? "bg-[var(--accent-600,var(--accent))] text-white "
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)] "
                )}
              >
                <Ticket className="h-4 w-4" />
                Cupón de mi tienda
              </button>
              <button
                type="button"
                onClick={() => setCouponScope("plataforma")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px]",
                  couponScope === "plataforma"
                    ? "bg-[var(--accent-600,var(--accent))] text-white "
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)] "
                )}
              >
                <Sparkles className="h-4 w-4" />
                Cupón de plataforma
              </button>
            </div>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-1">
              {couponScope === "tienda"
                ? "Este cupón será válido sólo para tu tienda"
                : "Este cupón será válido en toda la plataforma"}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            <Field label="Código *" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="DESCUENTO10" className="w-full mt-1 px-3 h-10 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
            </Field>
            <Field label="Descripción" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="10% de descuento" className="w-full mt-1 px-3 h-10 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
            </Field>
            <Field label="Tipo" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
              <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "percent" | "fixed" | "giftcard" }))} className="w-full mt-1 px-3 h-10 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm">
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
                {/* "Gift Card (saldo)" salió de acá: el Zod de POST /api/coupons
                    sólo acepta percent|fixed, así que elegirla devolvía 400 y el
                    cupón nunca se creaba. Las gift cards tienen su propio modelo
                    (GiftCard + GiftCardRedemption) y su módulo en Crecimiento →
                    Gift Cards. Los cupones giftcard que ya existan se siguen
                    leyendo y canjeando; sólo no se crean nuevos desde acá. */}
              </select>
            </Field>
            <Field label={form.discountType === "giftcard" ? "Saldo inicial (S/) *" : "Valor *"} labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
              <input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))} className="w-full mt-1 px-3 h-10 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
            </Field>
            <Field label="Compra mínima (S/)" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
              <input type="number" value={form.minPurchase} onChange={e => setForm(f => ({ ...f, minPurchase: Number(e.target.value) }))} className="w-full mt-1 px-3 h-10 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
            </Field>
            <Field label="Usos máximos (0 = ilimitado)" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
              <input type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))} className="w-full mt-1 px-3 h-10 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
            </Field>
            <Field label="Fecha expiración" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
              <input type="date" value={form.expiresAt ? form.expiresAt.slice(0, 10) : ""} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" }))} className="w-full mt-1 px-3 h-10 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={handleCreate} className="flex flex-wrap items-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition"><Check className="h-4 w-4" />Crear</button>
            <button onClick={() => setShowForm(false)} className="flex flex-wrap items-center gap-2 bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-muted px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold hover:bg-[var(--rule-soft)] transition"><X className="h-4 w-4" />Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {coupons.length > 5 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar código o descripción"
                aria-label="Buscar cupón"
                className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)]"
              />
            </div>
            <span className="text-sm text-[var(--text-secondary)]">
              {q ? `${visibles.length} de ${coupons.length}` : `${coupons.length} cupones`} · {activos} activo{activos === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {coupons.length === 0 && <p className="text-center text-[var(--text-tertiary)] dark:text-muted py-8">No hay cupones creados</p>}
        {coupons.length > 0 && visibles.length === 0 && <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">Ningún cupón coincide con «{busca.trim()}».</p>}
        {lista.map(c => (
          <div key={c.id} className={cn("bg-[var(--surface-raised)] border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3", c.active ? "border-[var(--rule-base)] dark:border-[var(--rule-base)]" : "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 opacity-60")}>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-extrabold text-primary text-lg">{c.code}</span>
                <button aria-label="Copiar código" title="Copiar código" onClick={() => { navigator.clipboard.writeText(c.code).then(() => toast.success(`Código ${c.code} copiado`)).catch((err) => console.warn("[CouponsTab] copiar código falló", err)); }} className="text-[var(--text-tertiary)] hover:text-primary"><Copy className="h-3.5 w-3.5" /></button>
                {c.storeId ? (
                  <span className="text-[length:var(--ts-2xs)] bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] px-2 py-0.5 rounded-full font-bold">Tienda</span>
                ) : (
                  <span className="text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] px-2 py-0.5 rounded-full font-bold">Plataforma</span>
                )}
                {!c.active && <span className="text-xs bg-[var(--data-error-100)] text-[var(--data-error-500)] px-2 py-0.5 rounded-full font-bold">Inactivo</span>}
              </div>
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{c.description || "Sin descripción"}</p>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-[var(--text-tertiary)] dark:text-muted">
                <span className="font-bold text-[var(--data-success-500)]">{c.discountType === "percent" ? `${c.discountValue}%` : c.discountType === "giftcard" ? `GC ${formatCurrency(c.balance ?? c.discountValue)}` : `S/${c.discountValue}`}</span>
                {c.minPurchase ? <span>Min: S/{c.minPurchase}</span> : null}
                {c.maxUses ? <span>Usos: {c.usedCount}/{c.maxUses}</span> : <span>Usos: {c.usedCount}/∞</span>}
                {c.expiresAt && <span>Exp: {formatDate(c.expiresAt)}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => { setWhatsappCoupon(c); setWhatsappPhone(""); }}
                className="p-1.5 rounded-xl text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 transition"
                title="Enviar por WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                onClick={() => copyWhatsappMsg(c)}
                className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]/20 transition"
                title="Copiar mensaje"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button onClick={() => toggleActive(c)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition", c.active ? "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] hover:bg-[var(--data-warning-500)]/25" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-primary/10")}>
                {c.active ? "Desactivar" : "Activar"}
              </button>
              <button aria-label="Eliminar" onClick={() => handleDelete(c.id)} className="p-1.5 rounded-xl text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {lista.length < visibles.length && (
          <button
            type="button"
            onClick={() => setVerTodos(true)}
            className="w-full rounded-xl border border-dashed border-[var(--rule-base)] py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            Ver los {visibles.length - lista.length} cupones restantes
          </button>
        )}
      </div>
    </>
  );
}
