"use client";

/**
 * CtpFleteModal — anotar el viaje (ADR-318).
 *
 * El camión llega, se anota; el precio a veces se cierra al día siguiente. Por
 * eso lo único obligatorio es la fecha: **el monto vacío queda `null`, nunca 0**.
 *
 * La placa, el transportista y el proveedor salen del directorio (ADR-317): son
 * los mismos de siempre y elegirlos deja el id, que es lo que permite después
 * responder "a este transportista le debo tanto".
 */

import { useMemo, useState } from "react";
import { Loader2, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { formatearPlaca } from "@/lib/forestal/directorio";
import {
  ESTADOS_PAGO,
  PAGADORES,
  PAGADOR_HINT,
  PAGADOR_LABEL,
  TIPOS_FLETE,
  TIPO_FLETE_LABEL,
  costoPorM3,
  type Flete,
  type FleteInput,
} from "@/lib/forestal/fletes";
import { Btn, Field, I, Seccion } from "./ctp-shared";

type Borrador = FleteInput & { id?: string };

const hoy = () => new Date().toISOString().slice(0, 10);

function aBorrador(f: Flete | null): Borrador {
  if (!f) return { fecha: hoy(), tipo: "ingreso", pagaQuien: "ctp", estadoPago: "pendiente", monto: null, volumenM3: null };
  return {
    id: f.id,
    fecha: f.fecha.slice(0, 10),
    tipo: f.tipo,
    gtfNumber: f.gtfNumber ?? "",
    vehiculoId: f.vehiculoId ?? "",
    placa: f.placa ?? "",
    transportistaId: f.transportistaId ?? "",
    transportistaNombre: f.transportistaNombre ?? "",
    conductorId: f.conductorId ?? "",
    proveedorId: f.proveedorId ?? "",
    proveedorNombre: f.proveedorNombre ?? "",
    volumenM3: f.volumenM3,
    monto: f.monto,
    moneda: f.moneda,
    pagaQuien: f.pagaQuien,
    estadoPago: f.estadoPago,
    fechaPago: f.fechaPago ? f.fechaPago.slice(0, 10) : "",
    notas: f.notas ?? "",
  };
}

export default function CtpFleteModal({
  flete,
  onGuardar,
  onClose,
}: {
  flete: Flete | null;
  onGuardar: (input: Borrador) => Promise<void>;
  onClose: () => void;
}) {
  const dir = useDirectorioForestal();
  const [b, setB] = useState<Borrador>(() => aBorrador(flete));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (v: Partial<Borrador>) => setB((p) => ({ ...p, ...v }));

  const transportistas = useMemo(() => dir.porRol("transportista"), [dir]);
  const conductores = useMemo(() => dir.porRol("conductor"), [dir]);
  const proveedores = useMemo(() => dir.porRol("proveedor"), [dir]);

  const unitario = costoPorM3({ monto: b.monto ?? null, volumenM3: b.volumenM3 ?? null });

  /** Elegir la placa trae también a su dueño, si el vehículo lo tiene cargado. */
  function elegirVehiculo(id: string) {
    const v = dir.vehiculos.find((x) => x.id === id);
    if (!v) {
      set({ vehiculoId: "", placa: "" });
      return;
    }
    set({
      vehiculoId: v.id,
      placa: v.placa,
      ...(v.transportistaId && !b.transportistaId
        ? { transportistaId: v.transportistaId, transportistaNombre: v.transportistaNombre ?? "" }
        : {}),
    });
  }

  async function guardar() {
    if (!b.fecha) {
      setError("La fecha del viaje es obligatoria.");
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
    <AdminModal open onClose={onClose} title={flete ? "Editar el viaje" : "Anotar un viaje"} variant="info">
      <div className="space-y-1">
        <Seccion numero={1} title="El viaje" hint="Lo único obligatorio es la fecha">
          <Field label="Fecha" required span={4}>
            <input type="date" className={I} value={b.fecha} onChange={(e) => set({ fecha: e.target.value })} />
          </Field>
          <Field label="Qué movió" span={4}>
            <select className={I} value={b.tipo} onChange={(e) => set({ tipo: e.target.value as Borrador["tipo"] })}>
              {TIPOS_FLETE.map((t) => (
                <option key={t} value={t}>{TIPO_FLETE_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="N° de guía" span={4} hint="Ata el viaje al libro">
            <input
              type="text"
              className={`${I} font-mono`}
              value={b.gtfNumber ?? ""}
              onChange={(e) => set({ gtfNumber: e.target.value })}
            />
          </Field>
        </Seccion>

        <Seccion numero={2} title="Quién lo hizo" hint="Del directorio: así se puede agrupar después">
          <Field label="Vehículo" span={4}>
            <select className={I} value={b.vehiculoId ?? ""} onChange={(e) => elegirVehiculo(e.target.value)}>
              <option value="">— Elegir placa —</option>
              {dir.vehiculosActivos.map((v) => (
                <option key={v.id} value={v.id}>
                  {formatearPlaca(v.placa)}{v.marca ? ` · ${v.marca}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Placa" span={4} hint={b.vehiculoId ? "Viene del directorio" : "Si el camión no está en el directorio"}>
            <input
              type="text"
              className={`${I} font-mono uppercase`}
              value={b.placa ?? ""}
              onChange={(e) => set({ placa: e.target.value.toUpperCase(), vehiculoId: "" })}
            />
          </Field>
          <Field label="Conductor" span={4}>
            <select className={I} value={b.conductorId ?? ""} onChange={(e) => set({ conductorId: e.target.value })}>
              <option value="">— Sin registrar —</option>
              {conductores.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Transportista" span={6}>
            <select
              className={I}
              value={b.transportistaId ?? ""}
              onChange={(e) => {
                const t = transportistas.find((x) => x.id === e.target.value);
                set({ transportistaId: e.target.value, transportistaNombre: t?.nombre ?? "" });
              }}
            >
              <option value="">— Sin registrar —</option>
              {transportistas.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="De quién era la carga" span={6} hint="Para saber a quién se le descuenta">
            <select
              className={I}
              value={b.proveedorId ?? ""}
              onChange={(e) => {
                const p = proveedores.find((x) => x.id === e.target.value);
                set({ proveedorId: e.target.value, proveedorNombre: p?.nombre ?? "" });
              }}
            >
              <option value="">— Sin registrar —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </Field>
        </Seccion>

        <Seccion numero={3} title="Cuánto" hint="Sin monto queda pendiente de cerrar, no en cero">
          <Field label="Volumen movido (m³)" span={4}>
            <input
              type="number"
              step="0.0001"
              min="0"
              className={`${I} text-right font-mono tabular-nums`}
              value={b.volumenM3 ?? ""}
              onChange={(e) => set({ volumenM3: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="Monto del flete (S/)" span={4} hint={unitario != null ? `Sale S/ ${unitario.toFixed(2)} por m³` : "Vacío = todavía no se sabe"}>
            <input
              type="number"
              step="0.01"
              min="0"
              className={`${I} text-right font-mono tabular-nums`}
              value={b.monto ?? ""}
              onChange={(e) => set({ monto: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="Estado" span={4}>
            <select
              className={I}
              value={b.estadoPago}
              onChange={(e) => set({ estadoPago: e.target.value as Borrador["estadoPago"] })}
            >
              {ESTADOS_PAGO.map((s) => (
                <option key={s} value={s}>{s === "pagado" ? "Pagado" : "Pendiente de pago"}</option>
              ))}
            </select>
          </Field>
          <Field label="Quién lo paga" span={12} hint={PAGADOR_HINT[b.pagaQuien]}>
            <div className="flex flex-wrap gap-2">
              {PAGADORES.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={b.pagaQuien === p}
                  onClick={() => set({ pagaQuien: p })}
                  className={`inline-flex h-11 items-center rounded-xl border-2 px-3.5 text-sm font-bold transition-colors ${
                    b.pagaQuien === p
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                  }`}
                >
                  {PAGADOR_LABEL[p]}
                </button>
              ))}
            </div>
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
