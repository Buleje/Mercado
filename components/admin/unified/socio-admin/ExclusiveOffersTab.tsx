"use client";

/**
 * ExclusiveOffersTab — Catálogo de productos con precio Socio.
 *
 * CRUD básico de ofertas exclusivas para miembros del programa Socio Buleje.
 */

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  Package,
  TrendingDown,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";

interface ExclusiveOffer {
  id: string;
  productName: string;
  regularPrice: number;
  socioPrice: number;
  discount: number;
  active: boolean;
  usageCount: number;
  createdAt: string;
}

const MOCK_OFFERS: ExclusiveOffer[] = [
  {
    id: "OFR-001",
    productName: "Arroz Superior 5kg",
    regularPrice: 25,
    socioPrice: 21,
    discount: 16,
    active: true,
    usageCount: 42,
    createdAt: "2026-03-01",
  },
  {
    id: "OFR-002",
    productName: "Aceite Cocinero 1L",
    regularPrice: 12,
    socioPrice: 10,
    discount: 17,
    active: true,
    usageCount: 28,
    createdAt: "2026-03-05",
  },
  {
    id: "OFR-003",
    productName: "Detergente Ariel 850g",
    regularPrice: 18,
    socioPrice: 15.5,
    discount: 14,
    active: true,
    usageCount: 15,
    createdAt: "2026-04-01",
  },
  {
    id: "OFR-004",
    productName: "Azúcar Rubia 5kg",
    regularPrice: 22,
    socioPrice: 19,
    discount: 14,
    active: false,
    usageCount: 0,
    createdAt: "2026-02-20",
  },
];

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function OfferModal({
  offer,
  onClose,
  onSave,
}: {
  offer: Partial<ExclusiveOffer> | null;
  onClose: () => void;
  onSave: (data: Omit<ExclusiveOffer, "id" | "usageCount" | "createdAt">) => void;
}) {
  const [form, setForm] = useState({
    productName: offer?.productName ?? "",
    regularPrice: offer?.regularPrice ?? 10,
    socioPrice: offer?.socioPrice ?? 8,
    active: offer?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);

  const discount = form.regularPrice > 0
    ? Math.round(((form.regularPrice - form.socioPrice) / form.regularPrice) * 100)
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productName.trim()) {
      setError("El nombre del producto es obligatorio.");
      return;
    }
    if (form.socioPrice >= form.regularPrice) {
      setError("El precio Socio debe ser menor al regular.");
      return;
    }
    onSave({ ...form, discount });
    onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={offer?.id ? "Editar oferta exclusiva" : "Nueva oferta exclusiva"}
    >
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-500)]">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <Field label="Producto *" labelClassName="text-xs font-bold text-[var(--text-secondary)]" className="space-y-1.5">
            <input
              type="text"
              value={form.productName}
              onChange={(e) => setForm((p) => ({ ...p, productName: e.target.value }))}
              placeholder="Nombre del producto"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio regular (S/)" labelClassName="text-xs font-bold text-[var(--text-secondary)]" className="space-y-1.5">
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.regularPrice}
                onChange={(e) => setForm((p) => ({ ...p, regularPrice: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </Field>
            <Field label="Precio Socio (S/)" labelClassName="text-xs font-bold text-[var(--text-secondary)]" className="space-y-1.5">
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.socioPrice}
                onChange={(e) => setForm((p) => ({ ...p, socioPrice: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between p-3 bg-[var(--data-success-50)] rounded-xl border border-[var(--data-success-500)]">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Descuento Socio</span>
            <span className="text-lg font-extrabold text-[var(--data-success-500)]">{discount}%</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Oferta activa</p>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, active: !p.active }))}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                form.active ? "bg-primary" : "bg-gray-300"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white dark:bg-[var(--color-card)] shadow-sm transition-transform",
                form.active ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
            >
              <Save className="h-4 w-4" />
              Guardar
            </button>
          </div>
        </form>
    </AdminModal>
  );
}

export function ExclusiveOffersTab() {
  const [offers, setOffers] = useState<ExclusiveOffer[]>(MOCK_OFFERS);
  const [modal, setModal] = useState<{ open: boolean; offer: Partial<ExclusiveOffer> | null }>({
    open: false,
    offer: null,
  });

  const handleSave = (data: Omit<ExclusiveOffer, "id" | "usageCount" | "createdAt">) => {
    const id = modal.offer?.id;
    if (id) {
      setOffers((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...data } : o))
      );
    } else {
      const newOffer: ExclusiveOffer = {
        ...data,
        id: `OFR-${Date.now()}`,
        usageCount: 0,
        createdAt: new Date().toISOString().split("T")[0],
      };
      setOffers((prev) => [newOffer, ...prev]);
    }
  };

  const handleDelete = (id: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-[var(--data-info-50)] border border-[var(--data-info-500)] rounded-xl text-sm text-[var(--data-info-500)]">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Ofertas exclusivas Socio Buleje</p>
          <p className="text-xs mt-0.5">Solo visibles para miembros activos. El precio Socio se aplica automáticamente al checkout.</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">
          {offers.filter((o) => o.active).length} oferta{offers.filter((o) => o.active).length !== 1 ? "s" : ""} activa{offers.filter((o) => o.active).length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setModal({ open: true, offer: null })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva oferta
        </button>
      </div>

      {offers.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin ofertas exclusivas configuradas</p>
          <p className="text-xs mt-1">Crea tu primera oferta para miembros Socio.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[var(--color-card)] border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Producto</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden sm:table-cell">Regular</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Precio Socio</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Descuento</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden md:table-cell">Usos</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {offers.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[var(--text-primary)]">{o.productName}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{o.id}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden sm:table-cell line-through">
                      {fmt(o.regularPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary">
                      {fmt(o.socioPrice)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--data-success-100)] text-[var(--data-success-500)]">
                        <TrendingDown className="h-3 w-3" />
                        -{o.discount}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--text-secondary)] hidden md:table-cell">
                      {o.usageCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                        o.active ? "bg-[var(--data-success-100)] text-[var(--data-success-500)]" : "bg-gray-100 text-[var(--text-secondary)]"
                      )}>
                        {o.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModal({ open: true, offer: o })}
                          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </div>
      )}

      {modal.open && (
        <OfferModal
          offer={modal.offer}
          onClose={() => setModal({ open: false, offer: null })}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
