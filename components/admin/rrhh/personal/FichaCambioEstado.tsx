"use client";

/**
 * FichaCambioEstado — pasar a vacaciones, licencia o suspensión, o volver a
 * activo, desde la ficha. CESADO sale por «Cesar»/«Reingresar», nunca por acá
 * (el servidor tira `EstadoInvalidoError`).
 */

import { useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { BOTON, CLASE_CAMPO } from "../rrhh-form";
import { COLABORADOR_ESTADO_META } from "../rrhh-ui";
import type { UseRrhhFichaResult } from "@/hooks/use-rrhh-ficha";
import type { EstadoColaborador } from "@/lib/rrhh/tipos";

const ESTADOS_CAMBIABLES = ["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO"] as const;
type EstadoCambiable = (typeof ESTADOS_CAMBIABLES)[number];

interface Props {
  estadoActual: EstadoColaborador;
  guardando: boolean;
  accion: UseRrhhFichaResult["accion"];
  onCancelar: () => void;
  onListo: () => void;
}

export default function FichaCambioEstado({ estadoActual, guardando, accion, onCancelar, onListo }: Props) {
  const opciones = ESTADOS_CAMBIABLES.filter((e) => e !== estadoActual);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoCambiable>(opciones[0] ?? "ACTIVO");
  const [conSinPago, setConSinPago] = useState(false);
  const [sinPagoDesde, setSinPagoDesde] = useState("");
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    // Antes, marcar «sin goce» sin fecha guardaba la suspensión CON goce, sin avisar.
    if (nuevoEstado === "SUSPENDIDO" && conSinPago && !sinPagoDesde) {
      setError("Elige desde qué día es sin goce de sueldo.");
      return;
    }
    setError(null);
    const res = await accion({
      action: "cambiar_estado",
      estado: nuevoEstado,
      sinPagoDesde: nuevoEstado === "SUSPENDIDO" && conSinPago ? sinPagoDesde : undefined,
    });
    if (!res.ok) {
      setError(res.error.message ?? "No se pudo cambiar el estado.");
      return;
    }
    onListo();
  };

  return (
    <section aria-label="Cambiar estado" className="space-y-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Pasa a" className="w-full sm:w-56">
          {(id) => (
            <select id={id} value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value as EstadoCambiable)} className={CLASE_CAMPO}>
              {opciones.map((e) => (
                <option key={e} value={e}>
                  {COLABORADOR_ESTADO_META[e].label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {nuevoEstado === "SUSPENDIDO" && (
          <label className="flex h-11 cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={conSinPago} onChange={(e) => setConSinPago(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Sin goce de sueldo
          </label>
        )}
        {nuevoEstado === "SUSPENDIDO" && conSinPago && (
          <Field label="Sin goce desde" className="w-full sm:w-48">
            {(id) => <input id={id} type="date" value={sinPagoDesde} onChange={(e) => setSinPagoDesde(e.target.value)} className={CLASE_CAMPO} />}
          </Field>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className={BOTON.chicoFantasma}>
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={guardando} className={BOTON.chicoPrimario}>
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar estado
        </button>
      </div>
    </section>
  );
}
