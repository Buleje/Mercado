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

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { claveBusqueda, formatearPlaca, normalizarPlaca } from "@/lib/forestal/directorio";
import {
  ESTADOS_PAGO,
  PAGADORES,
  PAGADOR_HINT,
  PAGADOR_LABEL,
  TIPOS_FLETE,
  TIPO_FLETE_LABEL,
  TIPOS_TRANSPORTE,
  TIPO_TRANSPORTE_LABEL,
  costoPorM3,
  type CandidatoFlete,
  type Flete,
  type FleteInput,
} from "@/lib/forestal/fletes";
import { Btn, Field, I, ModalBody, ModalFooter, Seccion, useAtajoGuardar, useCierreSeguro, useHayCambios } from "./ctp-shared";

type Borrador = FleteInput & { id?: string };

const hoy = () => new Date().toISOString().slice(0, 10);

function aBorrador(f: Flete | null): Borrador {
  if (!f) {
    return {
      fecha: hoy(),
      tipo: "ingreso",
      pagaQuien: "ctp",
      estadoPago: "pendiente",
      monto: null,
      volumenM3: null,
      tipoTransporte: "privado",
    };
  }
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
    conductorNombre: f.conductorNombre ?? "",
    tipoTransporte: f.tipoTransporte,
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

/** El borrador arranca desde una guía ya cargada: la fecha, la placa, el
 *  transportista y el conductor vienen de la GTF, no se vuelven a tipear. */
function aBorradorDesdeCandidato(c: CandidatoFlete): Borrador {
  return {
    fecha: c.fecha,
    tipo: "ingreso",
    gtfNumber: c.gtfNumber,
    placa: c.placa ?? "",
    transportistaNombre: c.transportistaNombre ?? "",
    conductorNombre: c.conductorNombre ?? "",
    tipoTransporte: c.tipoTransporte,
    proveedorNombre: c.proveedorNombre ?? "",
    volumenM3: c.volumenM3,
    pagaQuien: "ctp",
    estadoPago: "pendiente",
    monto: null,
  };
}

/**
 * Select del directorio + nombre manual editable — mismo patrón que
 * Placa/Vehículo, repetido para conductor/transportista/proveedor: elegir del
 * directorio deja el id (agrupa), pero un nombre tipeado a mano (o traído de
 * una guía cuyo transportista no está cargado todavía) sigue teniendo su fila.
 */
function CampoPersona({
  label,
  nombreLabel,
  span,
  hintSelect,
  opciones,
  id,
  nombre,
  onCambiar,
}: {
  label: string;
  nombreLabel: string;
  span: 4 | 6;
  hintSelect?: string;
  opciones: { id: string; nombre: string }[];
  id: string;
  nombre: string;
  onCambiar: (v: { id: string; nombre: string }) => void;
}) {
  return (
    <>
      <Field label={label} span={span} hint={hintSelect}>
        <select
          className={I}
          value={id}
          onChange={(e) => {
            const o = opciones.find((x) => x.id === e.target.value);
            onCambiar({ id: e.target.value, nombre: o?.nombre ?? nombre });
          }}
        >
          <option value="">— Sin registrar —</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>{o.nombre}</option>
          ))}
        </select>
      </Field>
      <Field label={nombreLabel} span={span} hint={id ? "Viene del directorio" : "Si no está en el directorio"}>
        <input
          type="text"
          className={I}
          value={nombre}
          onChange={(e) => onCambiar({ id: "", nombre: e.target.value })}
        />
      </Field>
    </>
  );
}

/**
 * El prellenado desde una guía sólo trae nombres (snapshot de la GTF, ADR-336):
 * si ese nombre YA existe en el Directorio, conviene el id — es lo que permite
 * agrupar "por transportista" después. Corre UNA vez, cuando el directorio
 * trae algo con qué comparar (no con `dir.cargando`: ese flag arranca en
 * `false` antes de que el propio hook dispare su fetch, y esperar a que esté
 * "no cargando" en ese instante inicial matchearía contra listas vacías).
 * Sólo llena ids VACÍOS — nunca pisa lo que el operador ya tipeó o eligió.
 */
function useAutoMatchDirectorio(
  activo: boolean,
  dir: ReturnType<typeof useDirectorioForestal>,
  listas: { transportistas: { id: string; nombre: string }[]; conductores: { id: string; nombre: string }[]; proveedores: { id: string; nombre: string }[] },
  setB: React.Dispatch<React.SetStateAction<Borrador>>,
) {
  const autoMatcheado = useRef(false);
  useEffect(() => {
    if (autoMatcheado.current || !activo) return;
    if (dir.partes.length === 0 && dir.vehiculos.length === 0) return;
    autoMatcheado.current = true;
    const buscar = (lista: { id: string; nombre: string }[], nombre: string) =>
      lista.find((o) => claveBusqueda(o.nombre) === claveBusqueda(nombre));
    setB((p) => {
      const next = { ...p };
      if (!next.vehiculoId && next.placa) {
        const v = dir.vehiculos.find((x) => normalizarPlaca(x.placa) === normalizarPlaca(next.placa ?? ""));
        if (v) next.vehiculoId = v.id;
      }
      if (!next.transportistaId && next.transportistaNombre) {
        const t = buscar(listas.transportistas, next.transportistaNombre);
        if (t) next.transportistaId = t.id;
      }
      if (!next.conductorId && next.conductorNombre) {
        const c = buscar(listas.conductores, next.conductorNombre);
        if (c) next.conductorId = c.id;
      }
      if (!next.proveedorId && next.proveedorNombre) {
        const p2 = buscar(listas.proveedores, next.proveedorNombre);
        if (p2) next.proveedorId = p2.id;
      }
      return next;
    });
  }, [activo, dir.partes, dir.vehiculos, listas.transportistas, listas.conductores, listas.proveedores, setB]);
}

export default function CtpFleteModal({
  flete,
  prellenado,
  progreso,
  onGuardar,
  onGuardado,
  onClose,
}: {
  flete: Flete | null;
  /** Candidato de una guía sin viaje anotado (ver "Guías sin flete anotado"). Se ignora si `flete` ya está editando uno existente. */
  prellenado?: CandidatoFlete | null;
  /** Posición dentro de un "Anotar las N" en curso — sólo cambia el texto, no la lógica. */
  progreso?: { actual: number; total: number; grupo?: string };
  onGuardar: (input: Borrador) => Promise<void>;
  /** Si viene, se llama en vez de `onClose` tras guardar con éxito — así el que
   *  encadena un "Anotar las N" avanza al siguiente sin cerrar el modal. */
  onGuardado?: () => void;
  onClose: () => void;
}) {
  const dir = useDirectorioForestal();
  const [b, setB] = useState<Borrador>(() => (flete ? aBorrador(flete) : prellenado ? aBorradorDesdeCandidato(prellenado) : aBorrador(null)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (v: Partial<Borrador>) => setB((p) => ({ ...p, ...v }));

  const transportistas = useMemo(() => dir.porRol("transportista"), [dir]);
  const conductores = useMemo(() => dir.porRol("conductor"), [dir]);
  const proveedores = useMemo(() => dir.porRol("proveedor"), [dir]);

  useAutoMatchDirectorio(!flete && Boolean(prellenado), dir, { transportistas, conductores, proveedores }, setB);

  const unitario = costoPorM3({ monto: b.monto ?? null, volumenM3: b.volumenM3 ?? null });

  /**
   * "Para avisar si la carga no entra" decía la ficha del vehículo desde que se
   * creó el directorio, pero nadie miraba el dato: se podía anotar un viaje de
   * 40 m³ en un camión de 30 sin una sola señal. La capacidad del vehículo
   * elegido contra el volumen anotado — advertencia, no bloqueo: hay viajes que
   * de verdad salen sobrecargados y el libro tiene que poder decirlo.
   */
  const excedeCapacidad = useMemo(() => {
    const v = dir.vehiculos.find((x) => x.id === b.vehiculoId);
    const cap = v?.capacidadM3 == null ? null : Number(v.capacidadM3);
    const vol = b.volumenM3 == null ? null : Number(b.volumenM3);
    if (cap == null || !Number.isFinite(cap) || cap <= 0 || vol == null || !Number.isFinite(vol)) return null;
    return vol > cap ? { cap, vol, placa: formatearPlaca(v?.placa ?? "") } : null;
  }, [dir.vehiculos, b.vehiculoId, b.volumenM3]);

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
      (onGuardado ?? onClose)();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  const bodyRef = useAtajoGuardar(() => void guardar(), !guardando);
  const cerrar = useCierreSeguro(useHayCambios(b) && !guardando, onClose);
  const esUltimoDeLaCola = !progreso || progreso.actual >= progreso.total;

  return (
    <AdminModal
      open
      onClose={cerrar}
      title={flete ? "Editar el viaje" : "Anotar un viaje"}
      description={
        progreso
          ? `Viaje ${progreso.actual} de ${progreso.total}${progreso.grupo ? ` · ${progreso.grupo}` : ""} — confirmá y cerrá el monto`
          : !flete && prellenado
            ? `Prellenado desde la guía ${prellenado.gtfNumber} · confirmá y cerrá el monto`
            : "Lo único obligatorio es la fecha; el monto se cierra después"
      }
      icon={Truck}
      variant="info"
      footer={
        <ModalFooter
          error={error}
          nota={
            excedeCapacidad
              ? `${excedeCapacidad.placa} declara ${excedeCapacidad.cap} m³ y el viaje lleva ${excedeCapacidad.vol} m³.`
              : unitario != null
                ? `Sale S/ ${unitario.toFixed(2)} por m³.`
                : undefined
          }
          atajo
        >
          <Btn variant="ghost" onClick={cerrar}>Cancelar</Btn>
          <Btn variant="primary" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {flete ? "Guardar cambios" : esUltimoDeLaCola ? "Anotar el viaje" : "Anotar y seguir"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={bodyRef}>
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
          <CampoPersona
            label="Conductor"
            nombreLabel="Nombre del conductor"
            span={4}
            opciones={conductores}
            id={b.conductorId ?? ""}
            nombre={b.conductorNombre ?? ""}
            onCambiar={({ id, nombre }) => set({ conductorId: id, conductorNombre: nombre })}
          />
          <Field
            label="Tipo de transporte"
            span={4}
            hint={b.tipoTransporte === "publico" ? "Genera deuda con el transportista" : "Vehículo propio: no genera deuda"}
          >
            <div className="flex gap-2">
              {TIPOS_TRANSPORTE.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={b.tipoTransporte === t}
                  onClick={() => set({ tipoTransporte: t })}
                  className={`inline-flex h-11 flex-1 items-center justify-center rounded-xl border-2 px-2 text-sm font-bold transition-colors ${
                    b.tipoTransporte === t
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                  }`}
                >
                  {TIPO_TRANSPORTE_LABEL[t]}
                </button>
              ))}
            </div>
          </Field>
          <CampoPersona
            label="Transportista"
            nombreLabel="Nombre del transportista"
            span={6}
            opciones={transportistas}
            id={b.transportistaId ?? ""}
            nombre={b.transportistaNombre ?? ""}
            onCambiar={({ id, nombre }) => set({ transportistaId: id, transportistaNombre: nombre })}
          />
          <CampoPersona
            label="De quién era la carga"
            nombreLabel="Nombre del proveedor"
            span={6}
            hintSelect="Para saber a quién se le descuenta"
            opciones={proveedores}
            id={b.proveedorId ?? ""}
            nombre={b.proveedorNombre ?? ""}
            onCambiar={({ id, nombre }) => set({ proveedorId: id, proveedorNombre: nombre })}
          />
        </Seccion>

        <Seccion numero={3} title="Cuánto" hint="Sin monto queda pendiente de cerrar, no en cero">
          <Field
            label="Volumen movido (m³)"
            span={4}
            hint={excedeCapacidad ? `Supera los ${excedeCapacidad.cap} m³ de ${excedeCapacidad.placa}` : undefined}
          >
            <input
              type="number"
              step="0.0001"
              min="0"
              className={`${I} text-right font-mono tabular-nums ${excedeCapacidad ? "border-[var(--data-warning-500)]" : ""}`}
              value={b.volumenM3 ?? ""}
              onChange={(e) => set({ volumenM3: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>
          {/* El costo por m³ se calcula, pero vive en el pie: ahí se lee sin
              perder de vista los dos campos que lo producen. */}
          <Field label="Monto del flete (S/)" span={4} hint="Vacío = todavía no se sabe">
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
      </ModalBody>
    </AdminModal>
  );
}
