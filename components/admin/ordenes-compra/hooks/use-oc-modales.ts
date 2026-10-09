import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import type { DbProduct } from "@/lib/jsondb";
import { useOcEstado } from "@/components/admin/ordenes-compra/hooks/use-oc-estado";
import { useOcRecurrentes } from "@/components/admin/ordenes-compra/hooks/use-oc-recurrentes";

/** Ventanas: foco, Escape, arrastre y el formulario de «Agregar producto». Parte de `useOrdenesCompra`. */
export function useOcModales(previo: ReturnType<typeof useOcEstado> & ReturnType<typeof useOcRecurrentes>) {
  const {
    showCreate, setShowCreate, showScanner, setShowScanner, showAddItemModal, setShowAddItemModal,
    showRecurringModal, setShowRecurringModal,
  } = previo;
  useScrollLock(showCreate || showScanner || showAddItemModal);

  // A11y: el modal de "Nueva orden" ya tenía role="dialog" pero sin trampa de
  // foco/Escape; el de "Hacer recurrente" no tenía ni siquiera el rol.
  const createModalRef = useRef<HTMLDivElement>(null);
  const closeCreateModal = useCallback(() => setShowCreate(false), [setShowCreate]);
  useModalAccesible(createModalRef, { onCerrar: closeCreateModal, activo: showCreate });
  const ventanaCreate = useVentanaDeModal(showCreate, { ref: createModalRef, aplicarTranslate: true, claveMemoria: "oc-nueva-orden" });

  const recurringModalRef = useRef<HTMLDivElement>(null);
  const recurringTitleId = useId();
  const closeRecurringModal = useCallback(() => setShowRecurringModal(null), [setShowRecurringModal]);
  useModalAccesible(recurringModalRef, { onCerrar: closeRecurringModal, activo: !!showRecurringModal });

  // «Agregar producto» y «Escanear» se abren DESDE ADENTRO de «Nueva orden».
  // Sin rol de diálogo propio el hook de la orden no sabía que tenía otro
  // encima: Escape cerraba la orden entera y se perdían los ítems cargados.
  const addItemModalRef = useRef<HTMLDivElement>(null);
  const closeAddItemModal = useCallback(() => setShowAddItemModal(false), [setShowAddItemModal]);
  useModalAccesible(addItemModalRef, { onCerrar: closeAddItemModal, activo: showAddItemModal });
  const ventanaAddItem = useVentanaDeModal(showAddItemModal, { ref: addItemModalRef, aplicarTranslate: true, claveMemoria: "oc-agregar-producto" });
  const scannerModalRef = useRef<HTMLDivElement>(null);
  const closeScannerModal = useCallback(() => setShowScanner(false), [setShowScanner]);
  useModalAccesible(scannerModalRef, { onCerrar: closeScannerModal, activo: showScanner });
  const ventanaScanner = useVentanaDeModal(showScanner, { ref: scannerModalRef, aplicarTranslate: true, claveMemoria: "oc-escanear-codigo" });
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
  const [newProdForm, setNewProdForm] = useState({ name: "", category: "abarrotes", price: 0, costPrice: 0, unit: "und", barcode: "", stock: 1 });
  const [savingNewProd, setSavingNewProd] = useState(false);
  return {
    createModalRef, closeCreateModal, ventanaCreate, recurringModalRef, recurringTitleId,
    closeRecurringModal, addItemModalRef, closeAddItemModal, ventanaAddItem, scannerModalRef,
    closeScannerModal, ventanaScanner, addItemMode, setAddItemMode, addItemSearchRef, addItemSearch,
    setAddItemSearch, addItemSel, setAddItemSel, addItemQty, setAddItemQty, addItemCost,
    setAddItemCost, newProdForm, setNewProdForm, savingNewProd, setSavingNewProd,
  };
}
