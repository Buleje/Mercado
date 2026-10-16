"use client";

/**
 * LibretaVehiculosModal — las placas del Directorio en una ventana encima de la
 * guía (Brandon 15-10-2026: «al usar la libreta, quiero que aparezca un modal
 * para poder elegir la información de esa libreta y agregar también nueva»).
 *
 * Dos pasos, como la libreta de las partes (`LibretaModal`): elegir de la lista
 * con buscador, o agregar uno nuevo arrancando con la placa ya tipeada en la
 * guía. La placa sigue la MISMA regla que el Directorio (`motivoPlacaVehiculo`)
 * y una embarcación lleva matrícula, que no se valida como placa.
 *
 * `aboveModals`: la guía ya es un modal; Escape cierra sólo esta capa.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Plus, Search, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import {
  esEmbarcacion,
  filtrarVehiculos,
  formatearPlaca,
  motivoPlacaVehiculo,
  normalizarPlaca,
  type Vehiculo,
  type VehiculoInput,
} from "@/lib/forestal/directorio";
import { CampoPlaca } from "./ctp-campo-placa";
import { Btn, Field, I } from "./ctp-shared";

/** Lo que la guía ya tiene escrito del vehículo. */
export interface VehiculoDeLaGuia {
  placa: string;
  placaRemolque?: string;
  marca: string;
  tipo: string;
}

export default function LibretaVehiculosModal({
  vehiculos,
  borrador,
  puedeAgregar,
  onUsar,
  onAgregar,
  onCerrar,
}: {
  vehiculos: Vehiculo[];
  borrador?: VehiculoDeLaGuia;
  puedeAgregar: boolean;
  onUsar: (v: Vehiculo) => void;
  /** Guarda en el Directorio y aplica a la guía. Tira con el motivo si no se pudo. */
  onAgregar: (input: VehiculoInput) => Promise<void>;
  onCerrar: () => void;
}) {
  const vacia = vehiculos.length === 0;
  const [paso, setPaso] = useState<"elegir" | "agregar">(vacia && puedeAgregar ? "agregar" : "elegir");
  const [q, setQ] = useState("");
  const [f, setF] = useState<VehiculoDeLaGuia>(() => ({
    placa: borrador?.placa ?? "",
    placaRemolque: borrador?.placaRemolque ?? "",
    marca: borrador?.marca ?? "",
    tipo: borrador?.tipo ?? "",
  }));
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const idForm = useId();
  const set = (v: Partial<VehiculoDeLaGuia>) => setF((p) => ({ ...p, ...v }));

  useEffect(() => {
    if (paso === "elegir") buscador.current?.focus();
  }, [paso]);

  const filtrados = useMemo(() => filtrarVehiculos(vehiculos, q).slice(0, 60), [vehiculos, q]);
  const embarcacion = esEmbarcacion(f.tipo);
  const duplicado = f.placa.trim() ? vehiculos.find((v) => normalizarPlaca(v.placa) === normalizarPlaca(f.placa)) : undefined;
  const motivo = motivoPlacaVehiculo(f, null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (duplicado) return setError(`Ya está en tu libreta como ${formatearPlaca(duplicado.placa)}: elígela de la lista.`);
    if (motivo) return setError(motivo.motivo);
    setGuardando(true);
    setError(null);
    try {
      await onAgregar({
        placa: f.placa.trim(),
        ...(f.placaRemolque?.trim() ? { placaRemolque: f.placaRemolque.trim() } : {}),
        ...(f.marca.trim() ? { marca: f.marca.trim() } : {}),
        ...(f.tipo.trim() ? { tipo: f.tipo.trim() } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  const pie =
    paso === "elegir" ? (
      <ModalFooter nota={`${vehiculos.length} ${vehiculos.length === 1 ? "vehículo" : "vehículos"} en tu libreta`}>
        <Btn onClick={onCerrar}>Cerrar</Btn>
        {puedeAgregar && (
          <Btn variant="primary" onClick={() => setPaso("agregar")}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar nuevo
          </Btn>
        )}
      </ModalFooter>
    ) : (
      <ModalFooter error={error} nota="Queda en tu Directorio y se usa en esta guía.">
        {vacia ? (
          <Btn onClick={onCerrar}>Cancelar</Btn>
        ) : (
          <Btn onClick={() => setPaso("elegir")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver a la lista
          </Btn>
        )}
        <Btn variant="primary" type="submit" form={idForm} disabled={guardando}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Guardar y usar
        </Btn>
      </ModalFooter>
    );

  return (
    <AdminModal
      open
      onClose={onCerrar}
      aboveModals
      size="md"
      icon={Truck}
      title={paso === "elegir" ? "Libreta · Vehículos" : "Agregar a la libreta · Vehículo"}
      claveVentana="libreta-vehiculo"
      footer={pie}
    >
      <div className="px-5 py-4 sm:px-6">
        {paso === "agregar" ? (
          <form id={idForm} onSubmit={(e) => void guardar(e)} className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-12 sm:[&_label]:min-h-6">
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
              valor={f.placaRemolque ?? ""}
              onCambio={(v) => set({ placaRemolque: v })}
            />
            <Field span={6} label="Marca">
              <input type="text" className={I} value={f.marca} onChange={(e) => set({ marca: e.target.value })} />
            </Field>
            <Field span={6} label="Tipo" hint="Camión, tráiler, camioneta… o «Embarcación» para una matrícula de río">
              <input type="text" className={I} value={f.tipo} onChange={(e) => set({ tipo: e.target.value })} />
            </Field>
          </form>
        ) : (
          <div className="grid gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
              <input
                ref={buscador}
                type="search"
                aria-label="Buscar vehículo por placa, marca o transportista"
                className={`${I} pl-9`}
                placeholder="Busca por placa, marca o transportista…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {filtrados.length === 0 ? (
              <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                {q ? `Ninguna placa coincide con «${q}».` : "Todavía no hay vehículos en la libreta."}
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {filtrados.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => onUsar(v)}
                      className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)] hover:bg-primary/5"
                    >
                      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                        {formatearPlaca(v.placa)}
                        {v.placaRemolque ? ` / ${formatearPlaca(v.placaRemolque)}` : ""}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-tertiary)]">
                        {[v.marca, v.tipo, v.transportistaNombre].filter(Boolean).join(" · ")}
                      </span>
                      {v.usos > 0 && (
                        <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
                          {v.usos}×
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
