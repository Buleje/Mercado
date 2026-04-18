"use client";

import { CardTitle } from "@buleje/design-system";
/**
 * ScheduleLiveModal — Programar una transmisión en vivo futura.
 *
 * Admin define título, descripción, fecha/hora y productos a destacar.
 */

import { useState } from "react";
import { X, Radio, Save, AlertCircle, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface ScheduledLiveData {
  title: string;
  description: string;
  scheduledAt: string;
  featuredProductIds: string[];
}

interface AvailableProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
}

const MOCK_PRODUCTS: AvailableProduct[] = [
  { id: "PRD-001", name: "Arroz Superior 5kg", price: 25, stock: 42 },
  { id: "PRD-002", name: "Aceite Cocinero 1L", price: 12, stock: 28 },
  { id: "PRD-003", name: "Detergente Ariel 850g", price: 18, stock: 15 },
  { id: "PRD-004", name: "Azúcar Rubia 5kg", price: 22, stock: 30 },
  { id: "PRD-005", name: "Gaseosa Inka Cola 1.5L", price: 8, stock: 60 },
  { id: "PRD-006", name: "Atún Florida 170g", price: 5, stock: 100 },
];

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  onClose: () => void;
  onSchedule: (data: ScheduledLiveData) => void;
}

export function ScheduleLiveModal({ onClose, onSchedule }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = MOCK_PRODUCTS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    if (!date || !time) {
      setError("Fecha y hora son obligatorias.");
      return;
    }
    if (selectedIds.size === 0) {
      setError("Selecciona al menos un producto destacado.");
      return;
    }
    const scheduledAt = `${date}T${time}:00`;
    if (new Date(scheduledAt) <= new Date()) {
      setError("La fecha debe ser futura.");
      return;
    }
    onSchedule({
      title,
      description,
      scheduledAt,
      featuredProductIds: Array.from(selectedIds),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100 z-10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#00B4A6] text-white flex items-center justify-center">
              <Radio className="h-4 w-4" />
            </div>
            <CardTitle className="font-extrabold text-[var(--text-primary)]">Programar transmisión</CardTitle>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Ofertas de fin de semana"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] outline-none"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe qué verán los espectadores"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Fecha *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Hora *</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Productos destacados ({selectedIds.size} seleccionados)</label>
            <input
              type="search"
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] outline-none"
            />
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
              {filteredProducts.map((p) => {
                const selected = selectedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition-colors",
                      selected && "bg-[#00B4A6]/5"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0",
                        selected ? "border-[#00B4A6] bg-[#00B4A6]" : "border-gray-300"
                      )}>
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">Stock: {p.stock}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{fmt(p.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-primary-dark transition-colors"
            >
              <Save className="h-4 w-4" />
              Programar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
