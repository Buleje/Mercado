"use client";

/**
 * «+ Nuevo» del modal «Guardar cubicación» (Brandon 28-10): el comprador, la
 * CCNN, el chofer, el lugar donde se cubicó, quien cubicó o la placa que
 * todavía no está en el Directorio se da de alta sin salir del modal. Abre el
 * MISMO editor del Directorio (`CtpParteModal` / `CtpVehiculoModal`), no un
 * formulario aparte; lo guardado queda elegido en su campo.
 */
import { Plus } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatearPlaca, type Parte, type RolParte, type Vehiculo } from "@/lib/forestal/directorio";
import CtpParteModal from "./CtpParteModal";
import CtpVehiculoModal from "./CtpVehiculoModal";
import type { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";

type Libreta = ReturnType<typeof useLibretaDeLaFicha>;

/** El campo de la ficha que se completa con la parte nueva. */
export type CampoDeAlta = "comprador" | "comunidad" | "chofer" | "transportista" | "lugar" | "cubicadoPor" | "placa";

const ROL_DEL_CAMPO: Record<Exclude<CampoDeAlta, "placa">, RolParte> = {
  comprador: "cliente",
  comunidad: "proveedor",
  chofer: "conductor",
  transportista: "transportista",
  /* El patio, el puerto o el depósito donde se midió: el lugar de acopio del Directorio. */
  lugar: "establecimiento",
  cubicadoPor: "cubicador",
};

const QUIEN: Record<CampoDeAlta, string> = {
  comprador: "un comprador",
  comunidad: "una CCNN o proveedor",
  chofer: "un chofer",
  transportista: "un transportista",
  lugar: "un lugar",
  cubicadoPor: "un cubicador",
  placa: "una placa",
};

export function BotonNuevo({ campo, onClick }: { campo: CampoDeAlta; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-alta={campo}
      aria-label={`Agregar ${QUIEN[campo]} nuevo al Directorio`} title={`Agregar ${QUIEN[campo]} nuevo al Directorio`}
      className={button({ variant: "secondary", className: "shrink-0 gap-1.5 rounded-2xl" })}>
      <Plus className="h-4 w-4" aria-hidden />
      Nuevo
    </button>
  );
}

export function AltaEnElDirectorio({ campo, libreta, placaEscrita = "", nombreEscrito = "", onElegida, onPlaca, onCerrar }: {
  campo: CampoDeAlta;
  libreta: Libreta;
  /** Lo que ya se escribió en «Placa»: el alta del camión arranca con eso. */
  placaEscrita?: string;
  /** Lo que ya se escribió en el campo (el comprador a mano): el alta arranca con ese nombre. */
  nombreEscrito?: string;
  onElegida: (campo: Exclude<CampoDeAlta, "placa">, p: Parte) => void;
  onPlaca: (v: Vehiculo) => void;
  onCerrar: () => void;
}) {
  if (campo === "placa") {
    return (
      <CtpVehiculoModal
        aboveModals
        vehiculo={null}
        placaInicial={placaEscrita.trim() ? formatearPlaca(placaEscrita) : ""}
        transportistas={libreta.transportistas}
        existentes={libreta.vehiculos}
        onGuardar={async (input) => { onPlaca(await libreta.guardarVehiculo(input)); }}
        onClose={onCerrar}
      />
    );
  }
  return (
    <CtpParteModal
      desdeOtroFormulario
      aboveModals
      parte={null}
      rolInicial={ROL_DEL_CAMPO[campo]}
      nombreInicial={nombreEscrito}
      existentes={libreta.partes}
      vehiculos={libreta.vehiculos}
      onGuardar={async (borrador) => {
        const guardada = await libreta.guardarParte(borrador);
        /* El editor se cierra solo DESPUÉS de colgar los permisos del alta. */
        if (guardada) onElegida(campo, guardada);
        return guardada;
      }}
      onUsarExistente={(existente) => {
        onElegida(campo, existente);
        onCerrar();
      }}
      onClose={onCerrar}
    />
  );
}
