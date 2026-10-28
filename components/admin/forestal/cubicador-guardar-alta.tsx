"use client";

/**
 * «+ Nuevo» del modal «Guardar cubicación» (Brandon 28-10): el comprador, la
 * CCNN o el chofer que todavía no está en el Directorio se da de alta sin
 * salir del modal. Abre el MISMO editor del Directorio (`CtpParteModal`), no
 * un formulario aparte; lo guardado queda elegido en su campo.
 */
import { Plus } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import CtpParteModal from "./CtpParteModal";
import type { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";

type Libreta = ReturnType<typeof useLibretaDeLaFicha>;

/** El campo de la ficha que se completa con la parte nueva. */
export type CampoDeAlta = "comprador" | "comunidad" | "chofer";

const ROL_DEL_CAMPO: Record<CampoDeAlta, RolParte> = {
  comprador: "cliente",
  comunidad: "proveedor",
  chofer: "conductor",
};

const QUIEN: Record<CampoDeAlta, string> = {
  comprador: "un comprador",
  comunidad: "una CCNN o proveedor",
  chofer: "un chofer",
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

export function AltaEnElDirectorio({ campo, libreta, onElegida, onCerrar }: {
  campo: CampoDeAlta;
  libreta: Libreta;
  onElegida: (campo: CampoDeAlta, p: Parte) => void;
  onCerrar: () => void;
}) {
  return (
    <CtpParteModal
      desdeOtroFormulario
      aboveModals
      parte={null}
      rolInicial={ROL_DEL_CAMPO[campo]}
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
