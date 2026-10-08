"use client";

/**
 * La barra de las guías tildadas que llevan a un trámite (Brandon 07-10:
 * «seleccionar las guías y aparecer opciones como "Relación de guías de
 * transporte forestal emitidas", seleccionarlas y usar ese formato»).
 *
 * La comparten la vista GTF del Libro TH (`LothGtfSeleccionBarra`) y «Guías
 * emitidas» del Libro CTP (`CtpGuiasEmitidasBarra`): cada una cuenta lo suyo
 * (`cifras`) y dice qué eligió (`elegidas` para decidir qué formato sirve,
 * `refs` con el prefijo de su libro para la URL). Acá viven los formatos que
 * aceptan guías (`formatosQueAceptan`): la relación como acción principal —es
 * la que se presenta cada período— y el resto en «Otro formato», cada uno
 * apagado con su motivo cuando lo elegido no le sirve (una anulación es de UNA
 * guía anulada). Elegir lleva a Trámites con el formato abierto y las guías
 * ya puestas.
 */

import { useMemo } from "react";
import { Ban, FileStack, FileText, Flag, Stamp } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { formatosQueAceptan, type GuiaElegida } from "@/lib/forestal/tramites-desde-guias";
import CtpBarraSeleccion, { type CifraSeleccion } from "./ctp-barra-seleccion";
import { irATramiteConGuias } from "./tramite-guias-url";

const RELACION = "relacion-guias-serfor";

/** Ícono por formato: lo que se reconoce de un vistazo en el menú. */
const ICONO: Record<string, typeof FileText> = {
  "anulacion-gtf": Ban,
  "comunicacion-perdida-gtf-serfor": Flag,
  "denuncia-policial-perdida-gtf": Flag,
  "reposicion-talonario-gtf": FileStack,
  "visado-talonario-gtf": Stamp,
};

export default function GuiasAFormatoBarra({
  elegidas,
  refs,
  cifras,
  onLimpiar,
}: {
  elegidas: readonly GuiaElegida[];
  /** Los ids como viajan en `?guias=` (`refGuia`): el del Libro TH sin prefijo, el del CTP con `ctp:`. */
  refs: readonly string[];
  cifras: CifraSeleccion[];
  onLimpiar: () => void;
}) {
  const opciones = useMemo(() => formatosQueAceptan(elegidas), [elegidas]);
  if (elegidas.length === 0) return null;

  const relacion = opciones.find((o) => o.formato.id === RELACION);
  const otros: MenuAccion[] = opciones
    .filter((o) => o.formato.id !== RELACION)
    .map((o) => ({
      id: o.formato.id,
      label: o.formato.nombre,
      hint: o.motivo ?? o.formato.proposito,
      icon: ICONO[o.formato.id] ?? FileText,
      disabled: !o.habilitado,
      onSelect: () => irATramiteConGuias(o.formato.id, refs),
    }));

  return (
    <CtpBarraSeleccion
      cifras={cifras}
      onLimpiar={onLimpiar}
      accionLabel="Relación de guías"
      accionIcon={FileText}
      accionDisabled={!relacion?.habilitado}
      onAccion={() => irATramiteConGuias(RELACION, refs)}
      menu={
        <ActionMenu
          label="Otro formato"
          icon={Stamp}
          size="md"
          compactoEnMovil
          title="Usar las guías elegidas en otro trámite: anulación, pérdida, talonario"
          actions={otros}
        />
      }
    />
  );
}
