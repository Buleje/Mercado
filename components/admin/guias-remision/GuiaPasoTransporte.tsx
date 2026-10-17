"use client";

/**
 * Etapa «Transporte» (F20): privado (tu vehículo: placa, conductor y DNI) o
 * público (la empresa de transporte con su RUC). Sólo se piden y se mandan los
 * datos de la modalidad elegida.
 */
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BloqueGuia, CampoGuia, errorDe, OpcionesGuia, UsarDeNuevo } from "./guia-piezas";
import type { TransporteFrecuente } from "./guia-reglas";
import type { ModalidadGuia } from "./tipos";
import type { NuevaGuia } from "./use-nueva-guia";

const MODALIDADES = [
  { valor: "privado", rotulo: "Privado", detalle: "Tu vehículo y tu conductor" },
  { valor: "publico", rotulo: "Público", detalle: "Una empresa de transporte" },
] as const satisfies readonly { valor: ModalidadGuia; rotulo: string; detalle: string }[];

const rotuloTransporte = (t: TransporteFrecuente) =>
  [t.vehiculoPlaca, t.modalidad === "publico" ? t.transportistaNombre : t.conductorNombre].filter(Boolean).join(" · ") || "Sin placa";

export function GuiaPasoTransporte({ g }: { g: NuevaGuia }) {
  const { form } = g;
  const err = errorDe(g.pendientes, g.visitados.includes("transporte"));
  const publico = form.modalidad === "publico";
  const opcional = publico ? " (opcional)" : "";

  return (
    <BloqueGuia
      titulo="Cómo viaja"
      extra={
        <InfoTip
          title="Transporte privado o público"
          what="Privado: la carga va en tu vehículo o en uno que manejas tú. Público: la lleva una empresa de transporte."
          affects="En un control de carretera piden la placa y el DNI del conductor (privado) o el RUC de la empresa (público)."
          example="Tu camioneta ABC-123 con Juan Pérez, DNI 44556677 · Transportes Ucayali SAC, RUC 20601234567."
        />
      }
    >
      <UsarDeNuevo opciones={g.frecuentes.transportes} rotulo={rotuloTransporte} onUsar={g.usarTransporte} />
      <OpcionesGuia rotulo="Modalidad del transporte" valor={form.modalidad} opciones={MODALIDADES} onCambio={g.setModalidad} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {publico && (
          <>
            <CampoGuia etiqueta="Empresa de transporte" placeholder="Transportes Ucayali SAC" valor={form.transportistaNombre} onCambio={(v) => g.campo("transportistaNombre", v)} />
            <CampoGuia etiqueta="RUC de la empresa" soloNumeros maxLength={11} placeholder="11 números" valor={form.transportistaRuc} onCambio={(v) => g.campo("transportistaRuc", v)} error={err("transportistaRuc")} />
          </>
        )}
        <CampoGuia etiqueta={`Placa${opcional}`} placeholder="ABC-123" maxLength={8} valor={form.vehiculoPlaca} onCambio={(v) => g.campo("vehiculoPlaca", v.toUpperCase())} />
        <CampoGuia etiqueta={`Conductor${opcional}`} placeholder="Nombre del conductor" valor={form.conductorNombre} onCambio={(v) => g.campo("conductorNombre", v)} />
        <CampoGuia etiqueta={`DNI del conductor${opcional}`} soloNumeros maxLength={8} placeholder="8 números" valor={form.conductorDni} onCambio={(v) => g.campo("conductorDni", v)} error={err("conductorDni")} />
      </div>
    </BloqueGuia>
  );
}
