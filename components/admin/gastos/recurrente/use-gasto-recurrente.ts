"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  type ExpenseCategoryDef,
  DEFAULT_EXPENSE_CATEGORIES,
  getCustomCategories,
  saveCustomCategory,
  removeCustomCategory,
} from "@/lib/expense-categories";
import {
  encodeExpenseDescription,
  type ExpenseMeta,
  type ExpenseFrequency,
  type ExpensePaymentMethod,
} from "@/lib/expense-meta";

/** La columna `paymentDay` acepta 0-31: un día del año (anual) se queda en la descripción. */
function diaValido(dia: string): boolean {
  const n = Number(dia);
  return Number.isInteger(n) && n >= 0 && n <= 31;
}

export interface OpcionesGastoRecurrente {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  tenantSlug: string;
  defaultCategory?: string;
}

/** Estado y acciones del modal «Nuevo gasto recurrente» (partido de `RecurringExpenseModal`). */
export function useGastoRecurrente({ open, onClose, onCreated, tenantSlug, defaultCategory }: OpcionesGastoRecurrente) {
  const { confirm } = useConfirm();
  // ── State ─────────────────────────────────────────────────────────
  const [customCats, setCustomCats] = useState<ExpenseCategoryDef[]>([]);
  const allCats = useMemo(
    () => [...DEFAULT_EXPENSE_CATEGORIES, ...customCats],
    [customCats],
  );

  const [selectedCategoryName, setSelectedCategoryName] = useState<string>(defaultCategory ?? "Servicios");
  const selectedCategory = useMemo(
    () => allCats.find((c) => c.name === selectedCategoryName) ?? allCats[0],
    [allCats, selectedCategoryName],
  );

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("mensual");
  const [paymentDay, setPaymentDay] = useState<string>("1");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("efectivo");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);

  // Sub-form: crear nueva categoría
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("package");
  const [newCatColor, setNewCatColor] = useState("teal");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptionRef = useRef<HTMLInputElement>(null);

  // Cargar custom cats cuando se abre el modal
  useEffect(() => {
    if (open) {
      setCustomCats(getCustomCategories(tenantSlug));
      setError(null);
      // Auto-focus en descripción
      setTimeout(() => descriptionRef.current?.focus(), 80);
    }
  }, [open, tenantSlug]);

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setDescription("");
      setAmount("");
      setSupplierName("");
      setNotes("");
      setFrequency("mensual");
      setPaymentDay("1");
      setPaymentMethod("efectivo");
      setReminderEnabled(false);
      setShowNewCategoryForm(false);
      setNewCatName("");
      setError(null);
    }
  }, [open]);

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError(null);
    const desc = description.trim();
    const numAmount = Number(amount);
    if (!desc) {
      setError("Falta describir el gasto");
      return;
    }
    if (!numAmount || numAmount <= 0) {
      setError("Monto inválido");
      return;
    }

    setSubmitting(true);
    try {
      const meta: ExpenseMeta = {
        frequency,
        paymentDay: frequency === "unico" ? undefined : Number(paymentDay),
        paymentMethod,
        supplierName: supplierName.trim() || undefined,
        notes: notes.trim() || undefined,
        reminderEnabled: reminderEnabled || undefined,
        iconKey: selectedCategory.iconKey,
        colorKey: selectedCategory.color,
      };

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          category: selectedCategoryName,
          description: encodeExpenseDescription(desc, meta),
          amount: numAmount,
          recurring: true,
          // ADR-374: las columnas reales, además del bloque de la descripción
          // (que sigue llevando ícono, color y recordatorio, que no tienen
          // columna). Sin ellas, «registrar el pago» desde la plantilla
          // heredaba un método vacío y no podía salir de la caja.
          frequency,
          ...(frequency !== "unico" && diaValido(paymentDay) && { paymentDay: Number(paymentDay) }),
          paymentMethod,
          supplierName: supplierName.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudo guardar el gasto");
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Crear nueva categoría ─────────────────────────────────────────
  const handleCreateCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (allCats.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setError(`Ya existe una categoría "${name}"`);
      return;
    }
    const next = saveCustomCategory(tenantSlug, {
      name,
      iconKey: newCatIcon,
      color: newCatColor,
    });
    setCustomCats(next);
    setSelectedCategoryName(name);
    setShowNewCategoryForm(false);
    setNewCatName("");
    setNewCatIcon("package");
    setNewCatColor("teal");
  };

  const handleRemoveCategory = async (name: string) => {
    if (!(await confirm({
      title: `¿Eliminar la categoría "${name}"?`,
      description: "Los gastos existentes no se borran.",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    }))) return;
    const next = removeCustomCategory(tenantSlug, name);
    setCustomCats(next);
    if (selectedCategoryName === name) setSelectedCategoryName("Otros");
  };

  return {
    allCats, selectedCategoryName, setSelectedCategoryName, selectedCategory,
    description, setDescription, amount, setAmount, frequency, setFrequency,
    paymentDay, setPaymentDay, paymentMethod, setPaymentMethod, supplierName, setSupplierName,
    notes, setNotes, reminderEnabled, setReminderEnabled,
    showNewCategoryForm, setShowNewCategoryForm, newCatName, setNewCatName,
    newCatIcon, setNewCatIcon, newCatColor, setNewCatColor,
    submitting, error, descriptionRef, handleSubmit, handleCreateCategory, handleRemoveCategory,
  };
}

export type GastoRecurrente = ReturnType<typeof useGastoRecurrente>;
