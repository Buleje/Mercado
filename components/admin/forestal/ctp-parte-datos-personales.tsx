"use client";

/**
 * «Datos personales» de la ficha del Directorio (ADR-524): nacimiento (fecha y
 * lugar), estado civil y parentesco. Sólo aparece para socios, dueños de local
 * o fichas con DNI: una comunidad o una empresa no los tiene. Son datos
 * personales (Ley 29733): sólo admin y dueño los ven.
 */
import { ESTADOS_CIVILES, type EstadoCivil } from "@/lib/admin/fichas-tramites-alquileres";
import { Field, I, Seccion } from "./ctp-shared";
import { ESTADO_CIVIL_UI, muestraDatosPersonales } from "./ficha-persona-ui";
import type { ParteFormEstado } from "./hooks/use-parte-form";

const vacio = (v: string) => (v.trim() ? v : null);

export default function CtpParteDatosPersonales({ form }: { form: ParteFormEstado }) {
  const { b, set, docTipo } = form;
  if (!muestraDatosPersonales(b.roles, docTipo)) return null;
  return (
    <Seccion title="Datos personales" hint="Los que piden el banco o la notaría para un contrato o un crédito. Sólo los ven el dueño y los administradores.">
      <Field label="Nació el" span={3}>
        <input type="date" className={I} value={b.nacimientoEl ?? ""} onChange={(e) => set({ nacimientoEl: e.target.value || null })} />
      </Field>
      <Field label="Lugar de nacimiento" span={3} ejemplo="Pucallpa, Coronel Portillo">
        <input type="text" className={I} maxLength={120} value={b.nacimientoLugar ?? ""} onChange={(e) => set({ nacimientoLugar: vacio(e.target.value) })} />
      </Field>
      <Field label="Estado civil" span={3} afecta="Si es casado(a), el banco suele pedir también los datos del cónyuge.">
        <select className={I} value={b.estadoCivil ?? ""} onChange={(e) => set({ estadoCivil: (e.target.value || null) as EstadoCivil | null })}>
          <option value="">Sin elegir</option>
          {ESTADOS_CIVILES.map((x) => (
            <option key={x} value={x}>
              {ESTADO_CIVIL_UI[x]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Parentesco" span={3} hint="Qué es de ti o de la familia." ejemplo="Mamá del dueño">
        <input type="text" className={I} maxLength={80} value={b.parentesco ?? ""} onChange={(e) => set({ parentesco: vacio(e.target.value) })} />
      </Field>
    </Seccion>
  );
}
