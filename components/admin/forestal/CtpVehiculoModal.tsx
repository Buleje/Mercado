"use client";

/**
 * CtpVehiculoModal — alta y edición de una placa del directorio (ADR-317).
 *
 * La placa se guarda normalizada (sin guiones) para que el mismo camión no entre
 * dos veces, y se muestra con guión, que es como se lee en el papel.
 *
 * 29-09-2026: la placa sigue la MISMA regla que la guía (`motivoPlacaVehiculo`
 * → `leerPlaca`): 3 caracteres y 3 números, con la zona registral a la vista.
 * Una embarcación lleva matrícula, que no sigue ese formato: se elige en
 * «Qué es» y la regla no se aplica.
 */

import { useMemo, useState } from "react";
import { Loader2, Save, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  esEmbarcacion,
  formatearPlaca,
  motivoPlacaVehiculo,
  normalizarPlaca,
  type Parte,
  type Vehiculo,
  type VehiculoInput,
} from "@/lib/forestal/directorio";
import { CampoPlaca } from "./ctp-campo-placa";
import { Btn, Field, I, ModalBody, ModalFooter, Seccion, useAtajoGuardar, useCierreSeguro, useHayCambios } from "./ctp-shared";

type Borrador = VehiculoInput & { id?: string };

export default function CtpVehiculoModal({
  vehiculo,
  transportistas,
  existentes = [],
  onGuardar,
  onClose,
}: {
  vehiculo: Vehiculo | null;
  transportistas: Parte[];
  /** Las placas ya cargadas — para avisar del duplicado ANTES de guardar. */
  existentes?: Vehiculo[];
  onGuardar: (input: Borrador) => Promise<void>;
  onClose: () => void;
}) {
  const [b, setB] = useState<Borrador>(() =>
    vehiculo
      ? {
          id: vehiculo.id,
          placa: vehiculo.placa,
          /* Sin esto el remolque guardado no se veía al editar y, al guardar,
             la edición explícita lo mandaba vacío: se BORRABA. */
          placaRemolque: vehiculo.placaRemolque ?? "",
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

  const placaNorm = normalizarPlaca(b.placa);
  const embarcacion = esEmbarcacion(b.tipo);
  /* La regla del servidor, corrida acá para decirlo ANTES de guardar. Vacío no
     se marca en rojo hasta que se intente guardar: el alta abre en blanco. Una
     ficha vieja con una placa que ya no pasa se juzga sólo si se TOCA la placa:
     cambiar su capacidad o sus notas no exige corregirla. */
  const guardada = vehiculo ? { placa: vehiculo.placa, placaRemolque: vehiculo.placaRemolque } : null;
  const motivo = motivoPlacaVehiculo(b, guardada);
  const placaSinTocar = Boolean(guardada) && normalizarPlaca(b.placa) === normalizarPlaca(guardada?.placa ?? "");
  const remolqueSinTocar =
    Boolean(guardada) && normalizarPlaca(b.placaRemolque ?? "") === normalizarPlaca(guardada?.placaRemolque ?? "");
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const motivoVisible = motivo && (intentoGuardar || placaNorm.length > 0 || motivo.campo === "placaRemolque") ? motivo : null;
  /**
   * El mismo camión entrando dos veces rompe el conteo de viajes por placa y
   * deja dos dueños posibles para el mismo vehículo. El servidor ya normaliza
   * la placa; acá se avisa ANTES, con el nombre de la ficha que ya existe.
   */
  const duplicado = useMemo(
    () =>
      placaNorm.length >= 5
        ? (existentes.find((v) => normalizarPlaca(v.placa) === placaNorm && v.id !== b.id) ?? null)
        : null,
    [existentes, placaNorm, b.id],
  );

  async function guardar() {
    if (motivo) {
      // El motivo sale en el pie (`nota`) y el botón se apaga hasta corregirlo.
      setIntentoGuardar(true);
      return;
    }
    if (duplicado) {
      setError(`${formatearPlaca(duplicado.placa)} ya está en el directorio. Edita esa ficha en vez de crear otra.`);
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

  const bodyRef = useAtajoGuardar(() => void guardar(), !guardando);
  const cerrar = useCierreSeguro(useHayCambios(b) && !guardando, onClose);

  return (
    <AdminModal
      open
      onClose={cerrar}
      title={vehiculo ? `Editar ${formatearPlaca(vehiculo.placa)}` : "Agregar vehículo"}
      description={vehiculo?.transportistaNombre ?? "La placa que va en la guía de transporte"}
      icon={Truck}
      variant="info"
      footer={
        <ModalFooter
          error={error}
          nota={
            duplicado
              ? `Ya existe ${formatearPlaca(duplicado.placa)} en el directorio.`
              : motivoVisible
                ? motivoVisible.motivo
                : undefined
          }
          atajo
        >
          <Btn variant="ghost" onClick={cerrar}>Cancelar</Btn>
          <Btn variant="primary" disabled={guardando || !!duplicado || !!motivoVisible} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={bodyRef}>
        <Seccion numero={1} title="El vehículo">
          <Field label="Qué es" span={4} hint="Una embarcación lleva matrícula, no placa">
            <select
              className={I}
              value={embarcacion ? "embarcacion" : "vehiculo"}
              onChange={(e) =>
                set(
                  e.target.value === "embarcacion"
                    ? { tipo: embarcacion ? b.tipo : "Embarcación" }
                    : { tipo: embarcacion ? "" : b.tipo },
                )
              }
            >
              <option value="vehiculo">Vehículo (placa)</option>
              <option value="embarcacion">Embarcación (matrícula)</option>
            </select>
          </Field>
          <CampoPlaca
            label={embarcacion ? "Matrícula" : "Placa"}
            required
            span={4}
            autoFocus
            validar={!embarcacion}
            soloAviso={placaSinTocar ? "guardada" : undefined}
            hint={duplicado ? "Ya está en el directorio" : "Lo primero que compara un control"}
            /* El formato lo dice el propio campo; de afuera sólo el duplicado
               y, en una embarcación, la matrícula vacía o corta. */
            error={
              duplicado
                ? `Ya está en el directorio como ${formatearPlaca(duplicado.placa)}.`
                : embarcacion && motivoVisible?.campo === "placa"
                  ? motivoVisible.motivo
                  : null
            }
            valor={b.placa}
            onCambio={(v) => set({ placa: v })}
          />
          {/* Son DOS unidades y la guía declara las dos: guardarla acá evita
              re-tipearla en cada guía del mismo camión. */}
          <CampoPlaca
            label="Placa remolque"
            span={4}
            opcional
            validar={!embarcacion}
            soloAviso={remolqueSinTocar ? "guardada" : undefined}
            hint="Sólo si el camión lleva acoplado"
            valor={b.placaRemolque ?? ""}
            onCambio={(v) => set({ placaRemolque: v })}
          />
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
      </ModalBody>
    </AdminModal>
  );
}
