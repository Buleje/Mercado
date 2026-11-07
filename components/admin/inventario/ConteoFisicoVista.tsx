"use client";

/**
 * Productos e inventario › Conteo físico.
 *
 * Una cabecera en una fila: título + ⓘ · cómo vas a contar. Las tres
 * maneras de contar —Asistente (ConteoFisicoWizard), Manual (PhysicalCountTab) y
 * Escáner (QuickStockCounter)— son el MODO de una sola pantalla, no pestañas de
 * un tercer nivel (Brandon 10-10). Siguen en `?sub=asistente|manual|escaner`,
 * así que los enlaces viejos caen en el modo correcto. Los mismos tres
 * componentes y los mismos endpoints de siempre. La declaración jurada es la
 * salida del conteo: un botón en la cabecera que abre la ventana de siempre.
 */

import dynamic from "next/dynamic";
import { FileSignature } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const ConteoFisicoWizard = dynamic(() => import("@/components/admin/inventario/ConteoFisicoWizard"), { loading: S });
const PhysicalCountTab = dynamic(() => import("@/components/admin/PhysicalCountTab"), { loading: S });
const QuickStockCounter = dynamic(() => import("@/components/admin/QuickStockCounter"), { loading: S });

/** Los modos de contar (`?sub=`). La lee `admin-subvistas-sincronizadas`. */
export const SUBS_CONTEO = ["asistente", "manual", "escaner"] as const;
type SubConteo = (typeof SUBS_CONTEO)[number];

const MODULE_ID = "inventario-conteo";

const MODOS: { value: SubConteo; label: string }[] = [
  { value: "asistente", label: "Asistente" },
  { value: "manual", label: "Manual" },
  { value: "escaner", label: "Escáner" },
];

export default function ConteoFisicoVista({ onDeclaracion }: { onDeclaracion: () => void }) {
  const { vista, irA } = useSubvistaModulo<SubConteo>(MODULE_ID, SUBS_CONTEO, "asistente");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Conteo físico</SectionTitle>
          <InfoTip
            title="Conteo físico"
            what="Cuentas lo que hay en el anaquel y lo comparas con lo que dice el sistema. Eliges cómo contar: el Asistente te guía paso a paso, Manual es una lista donde escribes lo que contaste, y Escáner es pasar el código de barras."
            affects="Al cerrar el conteo, el stock del sistema se ajusta a lo que contaste, solo en los productos con diferencia que dejes marcados."
            example="Contaste 12 botellas y el sistema decía 15: queda una diferencia de −3 y, si la ajustas, el stock pasa a 12."
          />
        </div>
        <div className="order-last w-full sm:order-none sm:w-auto">
          <SegmentedControl<SubConteo>
            value={vista}
            onChange={irA}
            options={MODOS}
            size="lg"
            label="Cómo vas a contar"
            className="w-full sm:w-auto [&>button]:h-12 [&>button]:flex-1"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Una sola acción secundaria: a la vista, no en un menú de un renglón. A 400 px queda el ícono. */}
          <button
            type="button"
            onClick={onDeclaracion}
            title="Declaración jurada de inventario: la foto oficial de tu almacén en una fecha"
            className={button({ variant: "secondary", className: "shrink-0 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}
          >
            <FileSignature className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Declaración jurada</span>
          </button>
        </div>
      </div>

      {vista === "asistente" && <ConteoFisicoWizard />}
      {vista === "manual" && <PhysicalCountTab />}
      {vista === "escaner" && <QuickStockCounter />}
    </div>
  );
}
