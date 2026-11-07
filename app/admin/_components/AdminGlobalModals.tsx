"use client";

/**
 * app/admin/_components/AdminGlobalModals.tsx
 *
 * Bundle de modals globales del panel admin que no tienen lógica propia en
 * page.tsx — solo se abren y cierran. Extraído del cuerpo de
 * `app/admin/page.tsx` en el Sprint A final del refactor para reducir la
 * página principal por debajo de 300 líneas.
 *
 * Incluye:
 *  - ClearDataModal (wizard de limpieza de datos demo)
 *  - El puente de Ctrl+K: desde el 20-10 el buscador es el campo de la
 *    cabecera (`GlobalSearch` en `AdminTopHeader`), sin ventana; `searchOpen`
 *    sólo le pide que se enfoque.
 *  - CierreDiarioModal (cierre diario de caja, dynamic)
 *  - ChangelogModal (novedades, dynamic)
 *  - AdminModuleManagerModal (gestor de módulos visibles)
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { enfocarBuscadorPanel } from "@/components/admin/buscador/enfocar-buscador";
import { ClearDataModal } from "@/components/admin/AdminModals";
import { AdminModuleManagerModal } from "@/components/admin/AdminModuleManagerModal";
import type { Tab } from "../_lib/tabs.types";

// Dynamic imports — mismos que vivían en page.tsx
const ChangelogModal = dynamic(
  () => import("@/components/admin/ChangelogModal"),
  { ssr: false },
);
const CierreDiarioModal = dynamic(
  () => import("@/components/cierre-diario/CierreDiarioModal"),
  { ssr: false },
);

export interface ClearDataBundle {
  show: boolean;
  setShow: (v: boolean) => void;
  step: 1 | 2 | 3;
  setStep: (s: 1 | 2 | 3) => void;
  text: string;
  setText: (s: string) => void;
  categories: Set<string>;
  setCategories: (s: Set<string>) => void;
  clearing: boolean;
  setClearing: (v: boolean) => void;
  demoDataModuleKeys: string[];
}

export interface AdminGlobalModalsProps {
  clearData: ClearDataBundle;

  // Buscador: abrirlo = enfocar el campo de la cabecera (Brandon 20-10, sin ventana).
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  /** Sin uso desde el 20-10: el buscador de la cabecera navega con `admin:navigate`. */
  navigateTab: (tab: Tab, vista?: string, sub?: string) => void;

  // Cierre diario
  showCierreDiario: boolean;
  setShowCierreDiario: (v: boolean) => void;

  // Changelog
  showChangelog: boolean;
  setShowChangelog: (v: boolean) => void;

  // Module manager — props se reenvían tal cual al modal hijo
  showModuleManager: boolean;
  setShowModuleManager: (v: boolean) => void;
  moduleManager: Omit<
    React.ComponentProps<typeof AdminModuleManagerModal>,
    "open" | "onClose"
  >;
}

export function AdminGlobalModals(props: AdminGlobalModalsProps) {
  const {
    clearData,
    searchOpen,
    setSearchOpen,
    showCierreDiario,
    setShowCierreDiario,
    showChangelog,
    setShowChangelog,
    showModuleManager,
    setShowModuleManager,
    moduleManager,
  } = props;

  /* Quien «abría el buscador» (Ctrl+K de los atajos, la paleta, un botón)
     ahora lo enfoca: no hay ventana que abrir. */
  useEffect(() => {
    if (!searchOpen) return;
    enfocarBuscadorPanel();
    setSearchOpen(false);
  }, [searchOpen, setSearchOpen]);

  // Puente entre el setter simple del hook (Set<string>) y el Dispatch que
  // espera ClearDataModal. Mismo truco que vivía inline en page.tsx.
  const setClearCategoriesBridge: React.Dispatch<
    React.SetStateAction<Set<string>>
  > = (action) =>
    clearData.setCategories(
      typeof action === "function"
        ? (action as (prev: Set<string>) => Set<string>)(clearData.categories)
        : action,
    );

  return (
    <>
      <ClearDataModal
        open={clearData.show}
        clearConfirmStep={clearData.step}
        setClearConfirmStep={clearData.setStep}
        clearConfirmText={clearData.text}
        setClearConfirmText={clearData.setText}
        clearCategories={clearData.categories}
        setClearCategories={setClearCategoriesBridge}
        clearingData={clearData.clearing}
        setClearingData={clearData.setClearing}
        onClose={() => clearData.setShow(false)}
        demoDataModuleKeys={clearData.demoDataModuleKeys}
      />

      <CierreDiarioModal
        open={showCierreDiario}
        onClose={() => setShowCierreDiario(false)}
      />

      <ChangelogModal
        open={showChangelog}
        onClose={() => setShowChangelog(false)}
      />

      <AdminModuleManagerModal
        {...moduleManager}
        open={showModuleManager}
        onClose={() => setShowModuleManager(false)}
      />
    </>
  );
}
