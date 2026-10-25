"use client";

/**
 * Repartir por bloque o zona las especies de un plan que YA existe (Brandon
 * 24-10). El mismo editor del alta (`LothPlanFormBloques`); acá arranca con el
 * reparto guardado o, si no hay, con todo lo registrado en el Bloque 1.
 *
 * Guardar el reparto NO toca lo registrado: si la suma no dice lo mismo, se
 * avisa (en vivo) y se guarda igual — corregir un m³ registrado se hace en la
 * fila de la especie, donde se ve lo que ya se taló de ella.
 */

import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { cuadreConElRegistro, type BloqueDelPlan } from "@/lib/forestal/loth-plan-bloques";
import { Btn } from "./ctp-shared";
import type { Species } from "./loth-plan-shared";
import LothPlanFormBloques from "./LothPlanFormBloques";
import { AvisoDescuadre } from "./LothPlantacionBloques";
import {
  bloqueNuevo,
  bloquesParaGuardar,
  edicionDesdeRegistro,
  edicionDesdeReparto,
  problemaDeLosBloques,
  type BloqueEnEdicion,
} from "./loth-plan-bloques-filas";
import { filaVacia, problemaDeFila, filaEnBlanco, type FilaEspecie } from "./loth-plan-especies-api";
import type { ResultadoReparto } from "./hooks/use-plan-bloques";

const SIN_LEIDAS: ReadonlySet<string> = new Set();

export default function LothPlantacionBloquesEditar({
  reparto,
  species,
  onGuardar,
  onClose,
}: {
  reparto: readonly BloqueDelPlan[];
  species: Species[];
  onGuardar: (bloques: BloqueDelPlan[]) => Promise<ResultadoReparto>;
  onClose: () => void;
}) {
  const [inicio] = useState(() => (reparto.length > 0 ? edicionDesdeReparto(reparto) : edicionDesdeRegistro(species)));
  const [especies, setEspecies] = useState<FilaEspecie[]>(inicio.filas);
  const [bloques, setBloquesCrudo] = useState<BloqueEnEdicion[]>(inicio.bloques);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const { confirm } = useConfirm();

  /* Quitar el último bloque deja uno vacío (acá no hay «lista sin bloques»: eso es quitar el reparto). */
  const setBloques = (b: BloqueEnEdicion[] | null) => {
    if (b && b.length > 0) return setBloquesCrudo(b);
    const uno = bloqueNuevo();
    setBloquesCrudo([uno]);
    setEspecies([{ ...filaVacia(), bloque: uno.uid }]);
  };

  const problemaBloques = problemaDeLosBloques(especies, bloques);
  const guardables = bloquesParaGuardar(especies, bloques);
  const descuadres = cuadreConElRegistro(guardables, species);

  async function enviar(lista: BloqueDelPlan[], hecho: string) {
    setGuardando(true);
    const r = await onGuardar(lista);
    setGuardando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.cambio ? hecho : "El reparto ya estaba así: no se cambió nada");
    onClose();
  }

  function guardar() {
    setIntento(true);
    const aMedias = especies.some((f) => !filaEnBlanco(f) && problemaDeFila(f) != null);
    if (aMedias || problemaBloques || guardables.length === 0) {
      if (guardables.length === 0) toast.error("Escribe al menos una especie con sus m³ en un bloque.");
      return;
    }
    void enviar(guardables, "Reparto por bloques guardado");
  }

  async function quitarReparto() {
    if (reparto.length === 0) return onClose();
    const ok = await confirm({
      title: "¿Quitar el reparto por bloques?",
      description: "Lo registrado por especie no cambia: sólo se borra dónde estaba cada una.",
      intent: "danger",
      confirmLabel: "Sí, quitarlo",
    });
    if (ok) void enviar([], "Reparto por bloques quitado");
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      title={reparto.length > 0 ? "Cambiar el reparto por bloques" : "Repartir por bloques o zonas"}
      description="Cuántos árboles, hectáreas y m³ de cada especie hay en cada bloque. El saldo sigue por especie."
      icon={LayoutGrid}
      size="xl"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            Cancelar
          </Btn>
          <Btn variant="primary" onClick={guardar} disabled={guardando} aria-busy={guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LayoutGrid className="h-4 w-4" aria-hidden="true" />}
            Guardar el reparto
          </Btn>
        </div>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        <AvisoDescuadre descuadres={descuadres} />
        <LothPlanFormBloques
          form={{
            especies,
            setEspecies,
            bloques,
            setBloques,
            intentoGuardar: intento,
            filasLeidas: SIN_LEIDAS,
            problemaBloques,
          }}
          sinBloques={{
            etiqueta: reparto.length > 0 ? "Quitar el reparto" : "Cancelar el reparto",
            onClick: () => void quitarReparto(),
          }}
        />
      </div>
    </AdminModal>
  );
}
