"use client";

/**
 * Alta o edición de un vehículo desde la libreta de la guía.
 *
 * Alta: arranca con la placa ya tipeada en la guía. Edición: con la ficha
 * guardada, y se manda ENTERA (con `id`, el Directorio trata lo que llega como
 * la fila completa: lo que no viaja se borra). La placa sigue la misma regla
 * del Directorio (`motivoPlacaVehiculo`, contra la ficha como está guardada: una
 * placa vieja que no cambió no se juzga); una embarcación lleva matrícula.
 */

import { useState } from "react";
import {
  esEmbarcacion,
  formatearPlaca,
  motivoPlacaVehiculo,
  normalizarPlaca,
  type Vehiculo,
  type VehiculoInput,
} from "@/lib/forestal/directorio";
import type { VehiculoDeLaGuia } from "./hooks/use-libreta";
import { CampoPlaca } from "./ctp-campo-placa";
import { Field, I } from "./ctp-shared";

interface Formulario {
  placa: string;
  placaRemolque: string;
  marca: string;
  tipo: string;
  configuracion: string;
  capacidad: string;
}

function inicial(editando: Vehiculo | undefined, borrador: VehiculoDeLaGuia | undefined): Formulario {
  if (editando) {
    return {
      placa: formatearPlaca(editando.placa),
      placaRemolque: editando.placaRemolque ? formatearPlaca(editando.placaRemolque) : "",
      marca: editando.marca ?? "",
      tipo: editando.tipo ?? "",
      configuracion: editando.configuracion ?? "",
      capacidad: editando.capacidadM3 == null ? "" : String(editando.capacidadM3),
    };
  }
  return {
    placa: borrador?.placa ?? "",
    placaRemolque: borrador?.placaRemolque ?? "",
    marca: borrador?.marca ?? "",
    tipo: borrador?.tipo ?? "",
    configuracion: "",
    capacidad: "",
  };
}

export default function AltaDeVehiculo({
  id,
  vehiculos,
  editando,
  borrador,
  onGuardar,
  onError,
}: {
  /** El `id` del `<form>`: el botón de guardar vive en el pie del modal. */
  id: string;
  /** Los de la libreta: una placa repetida se avisa antes de mandar. */
  vehiculos: readonly Vehiculo[];
  editando?: Vehiculo;
  borrador?: VehiculoDeLaGuia;
  onGuardar: (input: VehiculoInput & { id?: string }) => void;
  onError: (msg: string | null) => void;
}) {
  const [f, setF] = useState<Formulario>(() => inicial(editando, borrador));
  const [intento, setIntento] = useState(false);
  const set = (v: Partial<Formulario>) => setF((p) => ({ ...p, ...v }));

  const embarcacion = esEmbarcacion(f.tipo);
  const duplicado = f.placa.trim()
    ? vehiculos.find((v) => v.id !== editando?.id && normalizarPlaca(v.placa) === normalizarPlaca(f.placa))
    : undefined;
  const motivo = motivoPlacaVehiculo(f, editando ? { placa: editando.placa, placaRemolque: editando.placaRemolque } : null);
  const capacidad = f.capacidad.trim() ? Number(f.capacidad.replace(",", ".")) : null;
  const capacidadMal = capacidad !== null && (!Number.isFinite(capacidad) || capacidad < 0 || capacidad > 999);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (duplicado) return onError(`Ya está en tu libreta como ${formatearPlaca(duplicado.placa)}: elígela de la lista.`);
    if (motivo) return onError(motivo.motivo);
    if (capacidadMal) return onError("La capacidad va en m³, entre 0 y 999.");
    onError(null);
    if (editando) {
      onGuardar({
        id: editando.id,
        placa: f.placa.trim(),
        placaRemolque: f.placaRemolque.trim(),
        marca: f.marca.trim(),
        tipo: f.tipo.trim(),
        configuracion: f.configuracion.trim(),
        capacidadM3: capacidad,
        transportistaId: editando.transportistaId,
        notas: editando.notas ?? "",
        activo: editando.activo,
      });
      return;
    }
    onGuardar({
      placa: f.placa.trim(),
      ...(f.placaRemolque.trim() ? { placaRemolque: f.placaRemolque.trim() } : {}),
      ...(f.marca.trim() ? { marca: f.marca.trim() } : {}),
      ...(f.tipo.trim() ? { tipo: f.tipo.trim() } : {}),
      ...(f.configuracion.trim() ? { configuracion: f.configuracion.trim() } : {}),
      ...(capacidad !== null ? { capacidadM3: capacidad } : {}),
    });
  }

  return (
    <form id={id} onSubmit={enviar} className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-12 sm:[&_label]:min-h-6">
      <CampoPlaca
        label={embarcacion ? "Matrícula" : "Placa"}
        required
        span={6}
        autoFocus
        validar={!embarcacion}
        error={duplicado ? `Ya está en tu libreta como ${formatearPlaca(duplicado.placa)}.` : intento && motivo?.campo === "placa" ? motivo.motivo : null}
        valor={f.placa}
        onCambio={(v) => set({ placa: v })}
        onRemolque={(v) => set({ placaRemolque: v })}
      />
      <CampoPlaca
        label="Placa del remolque"
        span={6}
        opcional
        validar={!embarcacion}
        hint="Sólo si el camión lleva acoplado"
        valor={f.placaRemolque}
        onCambio={(v) => set({ placaRemolque: v })}
      />
      <Field span={6} label="Tipo" hint="Sale en la guía: camión, tráiler, camioneta… o «Embarcación» para una matrícula de río">
        <input type="text" className={I} value={f.tipo} onChange={(e) => set({ tipo: e.target.value })} />
      </Field>
      <Field span={6} label="Marca" hint="Interno">
        <input type="text" className={I} value={f.marca} onChange={(e) => set({ marca: e.target.value })} />
      </Field>
      <Field span={6} label="Configuración" hint="Interno: C2, T3S3…">
        <input type="text" className={`${I} font-mono`} value={f.configuracion} onChange={(e) => set({ configuracion: e.target.value })} />
      </Field>
      <Field span={6} label="Capacidad (m³)" hint={capacidadMal ? "Entre 0 y 999 m³" : "Interno: cuánta madera carga"}>
        <input type="text" inputMode="decimal" className={`${I} tabular-nums`} value={f.capacidad} onChange={(e) => set({ capacidad: e.target.value })} />
      </Field>
    </form>
  );
}
