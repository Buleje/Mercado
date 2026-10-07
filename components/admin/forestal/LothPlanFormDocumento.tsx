"use client";

/** Bloque «el documento aprobado» del formulario del plan (o el registro, si es plantación: `rotulosDe`). */

import { pideCampo } from "@/lib/forestal/loth-tipos-plan";
import { SelectConOtra } from "./campos-elegibles";
import { Field, cls } from "./loth-plan-ui";
import LothPlanConstanciaLector, { LineaLectorConstancia } from "./LothPlanConstanciaLector";
import Bloque from "./LothPlanFormBloque";
import { CampoPlan, clsEsencial } from "./LothPlanFormEsencial";
import { idEsencial } from "@/lib/forestal/loth-plan-esenciales";
import type { LothPlanFormEstado } from "./hooks/use-loth-plan-form";

export default function LothPlanFormDocumento({ form }: { form: LothPlanFormEstado }) {
  const { f, set, rot, esPlantacion, llevaEspecies, lector, arffsUsadas, esencial, intentoGuardar } = form;
  return (
    <Bloque n={2} titulo={rot.bloqueDocumento} accion={llevaEspecies ? <LothPlanConstanciaLector lector={lector} /> : undefined}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CampoPlan label={rot.numero} campo="planNumber" esencial={esencial("planNumber")} marcar={intentoGuardar}>
          <input
            id={idEsencial("planNumber")}
            value={f.planNumber}
            onChange={(e) => set("planNumber", e.target.value)}
            placeholder={rot.numeroEjemplo}
            className={clsEsencial(esencial("planNumber"), intentoGuardar, esPlantacion ? "font-mono" : "")}
          />
        </CampoPlan>
        {pideCampo(f.planType, "tituloHabilitante") && (
          <Field label="Título habilitante">
            <input value={f.tituloHabilitante} onChange={(e) => set("tituloHabilitante", e.target.value)} placeholder="17-CPO/C-J-001-02" className={cls} />
          </Field>
        )}
        <Field label={rot.resolucion}>
          <input value={f.resolucionNumber} onChange={(e) => set("resolucionNumber", e.target.value)} placeholder={rot.resolucionEjemplo} className={cls} />
        </Field>
        <Field label={rot.fechaResolucion}>
          <input type="date" value={f.resolucionDate} onChange={(e) => set("resolucionDate", e.target.value)} className={cls} />
        </Field>
        <Field label={rot.autoridad}>
          <SelectConOtra
            className={cls}
            valor={f.arffs}
            opciones={arffsUsadas}
            textoOtra="Otra autoridad…"
            placeholder="ATFFS Selva Central"
            onCambio={(v) => set("arffs", v)}
          />
        </Field>
      </div>
      {llevaEspecies && <LineaLectorConstancia lector={lector} />}
    </Bloque>
  );
}
