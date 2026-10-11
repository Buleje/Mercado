"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Copy, MessageCircle, Calendar, MoreHorizontal, Search, Power } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import OfertasEncabezado from "@/components/admin/promociones/OfertasEncabezado";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import CuponFormModal from "@/components/admin/cupones/CuponFormModal";
import type { Cupones } from "@/components/admin/cupones/hooks/use-cupones";

const LIMITE_CUPONES = 8;

/** Cupones creados a mano: cabecera, formulario y lista. Pieza de CouponsTab: recibe `useCupones` entero. */
export default function CuponesManuales({ cup, barra }: { cup: Cupones; /** Las secciones de la vista, en la misma fila de la cabecera. */ barra?: ReactNode }) {
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
      {/* ── Cabecera en una fila: título + ⓘ, secciones, «Nuevo cupón» y lo demás en «Más» ── */}
      <OfertasEncabezado
        barra={barra}
        ayuda={{
          title: "Cupones",
          what: "Códigos que el cliente escribe al pagar para llevarse un descuento: porcentaje o monto fijo, con compra mínima, tope de usos y vencimiento.",
          affects: "«De mi tienda» vale sólo aquí; «de plataforma», en todo el marketplace. Desactivar un cupón lo frena para compras nuevas sin borrarlo.",
          example: "DESCUENTO10: 10 % en compras desde S/ 30, máximo 50 usos, vence el viernes 31/10.",
        }}
      >
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          aria-expanded={showForm}
          aria-label="Nuevo cupón"
          className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary/90 sm:px-4"
        >
          <Plus className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Nuevo cupón</span>
        </button>
        <ActionMenu
          label="Más"
          soloIcono
          size="md"
          className="w-12 shrink-0"
          icon={MoreHorizontal}
          actions={[
            { id: "plantilla", label: "Plantilla de código", hint: "Arma códigos como BDAY1009K7Q para las reglas", icon: Calendar, onSelect: () => setShowTemplateBuilder(true) },
          ]}
        />
      </OfertasEncabezado>

      <CuponFormModal cup={cup} />

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
                className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)]"
              />
            </div>
            <span className="text-sm text-[var(--text-secondary)]">
              {q ? `${visibles.length} de ${coupons.length}` : `${coupons.length} cupones`} · {activos} activo{activos === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {coupons.length === 0 && <p className="text-center text-sm text-[var(--text-secondary)] py-6">Aún no tienes cupones: crea el primero con «Nuevo cupón».</p>}
        {coupons.length > 0 && visibles.length === 0 && <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">Ningún cupón coincide con «{busca.trim()}».</p>}
        {lista.map(c => (
          <div key={c.id} className={cn("bg-[var(--surface-raised)] border rounded-xl px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-2", c.active ? "border-[var(--rule-base)] dark:border-[var(--rule-base)]" : "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 opacity-60")}>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-extrabold text-primary text-lg">{c.code}</span>
                <button aria-label="Copiar código" title="Copiar código" onClick={() => { navigator.clipboard.writeText(c.code).then(() => toast.success(`Código ${c.code} copiado`)).catch((err) => console.warn("[CouponsTab] copiar código falló", err)); }} className="-my-3 inline-flex h-12 w-12 items-center justify-center text-[var(--text-secondary)] hover:text-primary"><Copy className="h-4 w-4" /></button>
                {c.storeId ? (
                  <span className="text-sm bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] px-2 py-0.5 rounded-full font-bold">Tienda</span>
                ) : (
                  <span className="text-sm bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] px-2 py-0.5 rounded-full font-bold">Plataforma</span>
                )}
                {!c.active && <span className="text-sm bg-[var(--data-error-100)] text-[var(--data-error-500)] px-2 py-0.5 rounded-full font-bold">Inactivo</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-sm text-[var(--text-secondary)]">
                <span className="font-bold text-[var(--data-success-500)]">{c.discountType === "percent" ? `${c.discountValue}%` : c.discountType === "giftcard" ? `GC ${formatCurrency(c.balance ?? c.discountValue)}` : `S/${c.discountValue}`}</span>
                {c.minPurchase ? <span>Min: S/{c.minPurchase}</span> : null}
                {c.maxUses ? <span>Usos: {c.usedCount}/{c.maxUses}</span> : <span>Usos: {c.usedCount}/∞</span>}
                {c.expiresAt && <span>Exp: {formatDate(c.expiresAt)}</span>}
                {c.description && <span className="min-w-0 max-w-full truncate text-[var(--text-tertiary)]" title={c.description}>{c.description}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => { setWhatsappCoupon(c); setWhatsappPhone(""); }}
                className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--data-success-ink)] transition hover:bg-primary/10 dark:text-[var(--data-success-500)]"
                title="Enviar por WhatsApp"
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Enviar</span>
              </button>
              <ActionMenu
                label={`Más acciones del cupón ${c.code}`}
                soloIcono
                size="md"
                className="w-12 shrink-0"
                icon={MoreHorizontal}
                actions={[
                  { id: "mensaje", label: "Copiar mensaje", icon: Copy, onSelect: () => copyWhatsappMsg(c) },
                  { id: "activar", label: c.active ? "Desactivar" : "Activar", hint: c.active ? "Deja de valer para compras nuevas" : "Vuelve a valer", icon: Power, onSelect: () => toggleActive(c) },
                  { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: () => handleDelete(c.id) },
                ]}
              />
            </div>
          </div>
        ))}
        {lista.length < visibles.length && (
          <button
            type="button"
            onClick={() => setVerTodos(true)}
            className="h-12 w-full rounded-xl border border-dashed border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            Ver los {visibles.length - lista.length} cupones restantes
          </button>
        )}
      </div>
    </>
  );
}
