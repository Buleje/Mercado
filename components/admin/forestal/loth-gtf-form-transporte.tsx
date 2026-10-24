"use client";

/**
 * La fila del transporte de «Anotar una guía» (Libro TH) y los casilleros del
 * formulario corto. Salió de `LothGtfForm` (09-10) al sumarle «Buscar placa».
 *
 * Brandon 09-10 (FOR-1): el camión T2H-847 de BAZAN ROSALES HERMINEZ RUBEN
 * quedó tipeado dos veces en Blas. Como en la guía del CTP, la lupa de la placa
 * trae transportista, su documento, conductor y licencia de tus guías y del
 * Directorio (`rellenarGuiaCorta`): sólo en lo vacío, todo sigue editable.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "@buleje/design-system/icons";
import { useBuscarPlaca } from "@/hooks/use-buscar-placa";
import { rellenarGuiaCorta, type DatoAplicado, type TransporteCorto } from "@/lib/forestal/placa-historial";
import { EJEMPLO_PLACA, leerPlaca, normalizarPlacaPeru } from "@/lib/forestal/placa-peru";
import { CampoPlaca } from "./ctp-campo-placa";
import { LineaDeBusqueda } from "./ctp-guia-placa";
import { Btn } from "./ctp-shared";

export type TransporteGuiaCorta = TransporteCorto & { placaVehiculo: string };

export const I =
  "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

export function TransporteDeGuiaCorta({ valor, onCambio }: { valor: TransporteGuiaCorta; onCambio: (c: Partial<TransporteGuiaCorta>) => void }) {
  const { estado, buscar } = useBuscarPlaca();
  const [aplicados, setAplicados] = useState<{ placa: string; lista: DatoAplicado[] }>({ placa: "", lista: [] });
  /* La respuesta vuelve después de hasta 8 s: se aplica sobre lo de ESE
     momento (lo tipeado mientras tanto no se pisa), no lo del clic. */
  const valorRef = useRef(valor);
  useEffect(() => {
    valorRef.current = valor;
  });

  const lectura = leerPlaca(valor.placaVehiculo);
  const actual = lectura.estado === "valida" ? lectura.normalizada : "";

  async function alBuscar() {
    if (lectura.estado !== "valida") return;
    const placa = lectura.normalizada;
    const r = await buscar(placa);
    // Si en el medio se cambió la placa, lo encontrado es de otro camión.
    if (!r || normalizarPlacaPeru(valorRef.current.placaVehiculo) !== placa) return;
    const rel = rellenarGuiaCorta(valorRef.current, r.sistema);
    if (Object.keys(rel.cambios).length) onCambio(rel.cambios);
    setAplicados({ placa, lista: rel.aplicados });
  }

  const set = (k: keyof TransporteGuiaCorta) => (e: React.ChangeEvent<HTMLInputElement>) => onCambio({ [k]: e.target.value });
  const buscando = estado.fase === "buscando";
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <CampoPlaca
        label="Placa vehículo"
        required
        valor={valor.placaVehiculo}
        onCambio={(v) => onCambio({ placaVehiculo: v })}
        accion={
          <Btn
            variant="secondary"
            className="w-11 shrink-0 px-0!"
            aria-label="Buscar placa"
            disabled={!actual || buscando}
            title={actual ? "Buscar placa: trae el transportista y el conductor de tus guías" : `Buscar placa: escribe una placa completa (ej. ${EJEMPLO_PLACA})`}
            onClick={() => void alBuscar()}
          >
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          </Btn>
        }
      />
      <Field label="Transportista *"><input value={valor.transportista} onChange={set("transportista")} className={I} /></Field>
      <Field label="Doc. transportista"><input value={valor.transportistaDoc} onChange={set("transportistaDoc")} inputMode="numeric" className={`${I} font-mono`} /></Field>
      <Field label="Conductor *"><input value={valor.conductor} onChange={set("conductor")} className={I} /></Field>
      <Field label="Licencia"><input value={valor.conductorLicencia} onChange={set("conductorLicencia")} placeholder="Q12345678" className={`${I} font-mono`} /></Field>
      {estado.fase !== "quieto" && estado.placa === actual && (
        <div className="col-span-2 lg:col-span-5">
          <LineaDeBusqueda estado={estado} aplicados={aplicados.placa === actual ? aplicados.lista : []} />
        </div>
      )}
    </div>
  );
}
