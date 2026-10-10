"use client";

/**
 * Productos e inventario › Conteo físico.
 *
 * Antes era un modal escondido en «Más acciones» de Stock, sin dirección propia
 * (plan «panel unificado» F18, ola 3, 2026-10-10). Ahora es una vista con su
 * 2.º nivel en `?sub=`: Asistente (ConteoFisicoWizard), Manual
 * (PhysicalCountTab) y Escáner (QuickStockCounter) — los mismos tres
 * componentes y los mismos tres endpoints de siempre. La declaración jurada es
 * la salida del conteo: un botón en el riel que abre la misma ventana que se
 * abría desde «Más acciones».
 */

import dynamic from "next/dynamic";
import { ClipboardList, FileSignature, ScanBarcode, Wand2 } from "@buleje/design-system/icons";
import AdminTabBar, { type AdminTab } from "@/components/admin/shared/AdminTabBar";
import { button } from "@/components/ui-system/button-variants";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const ConteoFisicoWizard = dynamic(() => import("@/components/admin/inventario/ConteoFisicoWizard"), { loading: S });
const PhysicalCountTab = dynamic(() => import("@/components/admin/PhysicalCountTab"), { loading: S });
const QuickStockCounter = dynamic(() => import("@/components/admin/QuickStockCounter"), { loading: S });

/** Las secciones del conteo (`?sub=`). La lee `admin-subvistas-sincronizadas`. */
export const SUBS_CONTEO = ["asistente", "manual", "escaner"] as const;
type SubConteo = (typeof SUBS_CONTEO)[number];

const MODULE_ID = "inventario-conteo";

const PESTANAS: AdminTab[] = [
  { id: "asistente", label: "Asistente", icon: Wand2, title: "Paso a paso: eliges qué contar, cuentas y concilias" },
  { id: "manual", label: "Manual", icon: ClipboardList, title: "Escribe lo que contaste producto por producto" },
  { id: "escaner", label: "Escáner", icon: ScanBarcode, title: "Cuenta pasando el código de barras" },
];

export default function ConteoFisicoVista({ onDeclaracion }: { onDeclaracion: () => void }) {
  const { vista, irA } = useSubvistaModulo<SubConteo>(MODULE_ID, SUBS_CONTEO, "asistente");

  return (
    <AdminTabBar
      tabs={PESTANAS}
      activeTab={vista}
      onTabChange={irA}
      moduleId={MODULE_ID}
      draggable={false}
      rightSlot={
        /* Botón del DS; a 400 px queda sólo el ícono (con su nombre para el lector)
           para que las tres pestañas no se partan. */
        <button
          type="button"
          onClick={onDeclaracion}
          title="Declaración jurada de inventario"
          className={button({ variant: "secondary", className: "shrink-0 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}
        >
          <FileSignature className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Declaración jurada</span>
        </button>
      }
    >
      {vista === "asistente" && <ConteoFisicoWizard />}
      {vista === "manual" && <PhysicalCountTab />}
      {vista === "escaner" && <QuickStockCounter />}
    </AdminTabBar>
  );
}
