import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import type { DbProduct } from "@/lib/jsondb";
import { useOcEstado } from "@/components/admin/ordenes-compra/hooks/use-oc-estado";
import { useOcRecurrentes } from "@/components/admin/ordenes-compra/hooks/use-oc-recurrentes";

/** Ventanas: foco, Escape, arrastre y el formulario de «Agregar producto». Parte de `useOrdenesCompra`. */
export function useOcModales(
  previo: ReturnType<typeof useOcEstado> & ReturnType<typeof useOcRecurrentes>,
) {
  const { setShowCreate, showAddItemModal, showRecurringModal, setShowRecurringModal } = previo;

  // A11y: el modal de "Nueva orden" ya tenía role="dialog" pero sin trampa de
  // foco/Escape; el de "Hacer recurrente" no tenía ni siquiera el rol.
  const closeCreateModal = useCallback(() => setShowCreate(false), [setShowCreate]);

  const recurringModalRef = useRef<HTMLDivElement>(null);
  const recurringTitleId = useId();
  const closeRecurringModal = useCallback(
    () => setShowRecurringModal(null),
    [setShowRecurringModal],
  );
  useModalAccesible(recurringModalRef, {
    onCerrar: closeRecurringModal,
    activo: !!showRecurringModal,
  });

  // «Nueva orden», «Agregar producto» y «Escanear» son AdminModal (foco,
  // Escape y arrastre los pone Radix; los dos de adentro van con aboveModals).
  const [addItemMode, setAddItemMode] = useState<"search" | "new">("search");
  /* Foco en el buscador sin `autoFocus` (jsx-a11y/no-autofocus): al abrir y al volver
     a «Buscar existente». En un rAF: useModalAccesible enfoca la X en el suyo,
     que se programa antes (mismo arreglo que ActivosModule). */
  const addItemSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!showAddItemModal || addItemMode !== "search") return;
    const id = requestAnimationFrame(() => addItemSearchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [showAddItemModal, addItemMode]);
  const [addItemSearch, setAddItemSearch] = useState("");
  const [addItemSel, setAddItemSel] = useState<DbProduct | null>(null);
  const [addItemQty, setAddItemQty] = useState(1);
  const [addItemCost, setAddItemCost] = useState(0);
  const [newProdForm, setNewProdForm] = useState({
    name: "",
    category: "abarrotes",
    price: 0,
    costPrice: 0,
    unit: "und",
    barcode: "",
    stock: 1,
  });
  const [savingNewProd, setSavingNewProd] = useState(false);
  return {
    closeCreateModal,
    recurringModalRef,
    recurringTitleId,
    closeRecurringModal,
    addItemMode,
    setAddItemMode,
    addItemSearchRef,
    addItemSearch,
    setAddItemSearch,
    addItemSel,
    setAddItemSel,
    addItemQty,
    setAddItemQty,
    addItemCost,
    setAddItemCost,
    newProdForm,
    setNewProdForm,
    savingNewProd,
    setSavingNewProd,
  };
}
