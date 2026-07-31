"use client";

/**
 * CtpVehiculoModal — alta y edición de una placa del directorio (ADR-317).
 *
 * La placa se guarda normalizada (sin guiones) para que el mismo camión no entre
 * dos veces, y se muestra con guión, que es como se lee en el papel.
 */

import { useState } from "react";
import { Loader2, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { formatearPlaca, normalizarPlaca, type Parte, type Vehiculo, type VehiculoInput } from "@/lib/forestal/directorio";
import { Btn, Field, I, Seccion } from "./ctp-shared";

type Borrador = VehiculoInput & { id?: string };

export default function CtpVehiculoModal({
  vehiculo,
  transportistas,
  onGuardar,
  onClose,
}: {
  vehiculo: Vehiculo | null;
  transportistas: Parte[];
  onGuardar: (input: Borrador) => Promise<void>;
  onClose: () => void;
}) {
  const [b, setB] = useState<Borrador>(() =>
    vehiculo
      ? {
          id: vehiculo.id,
          placa: vehiculo.placa,
          marca: vehiculo.marca ?? "",
          tipo: vehiculo.tipo ?? "",
          configuracion: vehiculo.configuracion ?? "",
          capacidadM3: vehiculo.capacidadM3,
          transportistaId: vehiculo.transportistaId ?? "",
          notas: vehiculo.notas ?? "",
          activo: vehiculo.activo,
        }
      : { placa: "", capacidadM3: null },
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (v: Partial<Borrador>) => setB((p) => ({ ...p, ...v }));

  async function guardar() {
    if (normalizarPlaca(b.placa).length < 5) {
      setError("La placa es obligatoria (mínimo 5 caracteres).");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(b);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  return (
    <AdminModal open onClose={onClose} title={vehiculo ? `Editar ${formatearPlaca(vehiculo.placa)}` : "Agregar vehículo"} variant="info">
      <div className="space-y-1">
        <Seccion numero={1} title="El vehículo">
          <Field label="Placa" required span={4} hint="Lo primero que compara un control">
            <input
              type="text"
              className={`${I} font-mono uppercase`}
              value={b.placa}
              onChange={(e) => set({ placa: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Marca" span={4}>
            <input type="text" className={I} value={b.marca ?? ""} onChange={(e) => set({ marca: e.target.value })} />
          </Field>
          <Field label="Tipo" span={4} hint="Camión, tráiler, camioneta…">
            <input type="text" className={I} value={b.tipo ?? ""} onChange={(e) => set({ tipo: e.target.value })} />
          </Field>
          <Field label="Configuración" span={4} hint="La del MTC: T3S3, C2…">
            <input
              type="text"
              className={`${I} font-mono uppercase`}
              value={b.configuracion ?? ""}
              onChange={(e) => set({ configuracion: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Capacidad (m³)" span={4} hint="Para avisar si la carga no entra">
            <input
              type="number"
              step="0.001"
              min="0"
              className={`${I} text-right font-mono tabular-nums`}
              value={b.capacidadM3 ?? ""}
              onChange={(e) => set({ capacidadM3: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="De quién es" span={4} hint="El transportista dueño del vehículo">
            <select className={I} value={b.transportistaId ?? ""} onChange={(e) => set({ transportistaId: e.target.value })}>
              <option value="">— Sin asignar —</option>
              {transportistas.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Notas" span={12}>
            <input type="text" className={I} value={b.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
          </Field>
        </Seccion>

        {error && (
          <p role="alert" className="pt-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--rule-base)] pt-4">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Btn>
        </div>
      </div>
    </AdminModal>
  );
}
