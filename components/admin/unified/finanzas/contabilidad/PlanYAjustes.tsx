"use client";

/** Mi Plata › Contabilidad › Plan de cuentas y ajustes: dos pestañas internas en una sola sección. */
import { useState } from "react";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import AjustesContables from "./AjustesContables";
import { CabeceraConta } from "./compartido";
import PlanDeCuentas from "./PlanDeCuentas";

const AYUDA = "El plan de cuentas es la lista de «cajones» donde se anota cada movimiento (Caja, Banco, Ventas, Sueldos…). Los ajustes dicen cómo armar los asientos de tu negocio.";

type Parte = "plan" | "ajustes";

export default function PlanYAjustes() {
  const [parte, setParte] = useState<Parte>("plan");
  return (
    <div className="space-y-4">
      <CabeceraConta titulo="Plan de cuentas y ajustes" ayuda={AYUDA} />
      <SegmentedControl<Parte>
        size="xl"
        label="Plan o ajustes"
        value={parte}
        onChange={setParte}
        options={[{ value: "plan", label: "Plan de cuentas" }, { value: "ajustes", label: "Ajustes" }]}
      />
      {parte === "plan" ? <PlanDeCuentas /> : <AjustesContables />}
    </div>
  );
}
