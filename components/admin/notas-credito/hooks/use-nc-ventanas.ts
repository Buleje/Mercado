import { useEffect, useMemo } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { escapeDeLaPaginaConFijado } from "@/hooks/use-ventana-de-modal";
import { useKeyboardShortcuts } from "@/components/admin/notas-credito/use-atajos-teclado";
import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";
import { useNcSelector } from "@/components/admin/notas-credito/hooks/use-nc-selector";
import { useNcLista } from "@/components/admin/notas-credito/hooks/use-nc-lista";
import { useNcAcciones } from "@/components/admin/notas-credito/hooks/use-nc-acciones";
import { useNcIndicadores } from "@/components/admin/notas-credito/hooks/use-nc-indicadores";

/** Ventanas accesibles, atajos y Escape (usan `resetWizard`, por eso van al final). Parte de `useNotasCredito`. */
export function useNcVentanas(previo: ReturnType<typeof useNcEstado> & ReturnType<typeof useNcSelector> & ReturnType<typeof useNcLista> & ReturnType<typeof useNcAcciones> & ReturnType<typeof useNcIndicadores>) {
  const {
    selected, setSelected, showShortcuts, setShowShortcuts, showNew, setShowNew, setWizardStep,
    setCreateError, setPickerSearch, setPickerDocType, searchRef, detailPanelRef,
  } = previo;
  // La ventana «Nueva nota de crédito» es un AdminModal: foco, Escape y clic afuera los pone él.
  useModalAccesible(detailPanelRef, { onCerrar: () => setSelected(null), activo: !!selected, cerrarConEscape: false });

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts(useMemo(() => ({
    n: () => { setShowNew(true); setCreateError(null); setWizardStep(0); setPickerSearch(""); setPickerDocType("all"); },
    f: () => searchRef.current?.focus(),
  }), [searchRef, setCreateError, setPickerDocType, setPickerSearch, setShowNew, setWizardStep]));

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      /* Con un modal fijado y el foco en la página, el Escape es de la página (ADR-420). */
      if (e.key !== "Escape" || escapeDeLaPaginaConFijado()) return;
      if (showNew) { setShowNew(false); return; }
      if (selected) { setSelected(null); return; }
      if (showShortcuts) { setShowShortcuts(false); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showNew, selected, showShortcuts, setSelected, setShowNew, setShowShortcuts]);

  return {};
}
