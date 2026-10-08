"use client";

/**
 * La barra de las guías tildadas en la vista GTF del Libro TH (Brandon 07-10:
 * «seleccionar las guías y aparecer opciones como "Relación de guías de
 * transporte forestal emitidas", seleccionarlas y usar ese formato»).
 *
 * Cuenta lo elegido (guías, m³ vigentes, piezas) y ofrece los formatos de
 * Trámites que aceptan guías (`formatosQueAceptan`): la relación como acción
 * principal —es la que se presenta cada período— y el resto en «Otro formato»,
 * cada uno apagado con su motivo cuando lo elegido no le sirve (una anulación
 * es de UNA guía anulada). Elegir lleva a Trámites con el formato abierto y
 * las guías ya puestas.
 */

import { useMemo } from "react";
import { Ban, FileStack, FileText, Flag, Stamp } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatosQueAceptan } from "@/lib/forestal/tramites-desde-guias";
import CtpBarraSeleccion, { type CifraSeleccion } from "./ctp-barra-seleccion";
import type { Gtf } from "./gtf-tabla-columnas";
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

export default function LothGtfSeleccionBarra({ elegidas, onLimpiar }: { elegidas: readonly Gtf[]; onLimpiar: () => void }) {
  const opciones = useMemo(() => formatosQueAceptan(elegidas), [elegidas]);
  if (elegidas.length === 0) return null;

  const anuladas = elegidas.filter((g) => g.status === "anulada").length;
  /* Vista previa: el volumen que declara el libro lo da el servidor. */
  const volumen = elegidas.filter((g) => g.status !== "anulada").reduce((a, g) => a + Number(g.volumenTotalM3 ?? 0), 0);
  const piezas = elegidas.reduce((a, g) => a + (g.piezasTotal ?? g.items?.length ?? 0), 0);
  const cifras: CifraSeleccion[] = [
    { label: elegidas.length === 1 ? "Guía" : "Guías", valor: anuladas > 0 ? `${elegidas.length} (${anuladas} anulada${anuladas === 1 ? "" : "s"})` : String(elegidas.length), fuerte: true },
    { label: "Volumen", valor: `${fmtM3(volumen)} m³` },
    { label: "Piezas", valor: String(piezas) },
  ];

  const ids = elegidas.map((g) => g.id);
  const relacion = opciones.find((o) => o.formato.id === RELACION);
  const otros: MenuAccion[] = opciones
    .filter((o) => o.formato.id !== RELACION)
    .map((o) => ({
      id: o.formato.id,
      label: o.formato.nombre,
      hint: o.motivo ?? o.formato.proposito,
      icon: ICONO[o.formato.id] ?? FileText,
      disabled: !o.habilitado,
      onSelect: () => irATramiteConGuias(o.formato.id, ids),
    }));

  return (
    <CtpBarraSeleccion
      cifras={cifras}
      onLimpiar={onLimpiar}
      accionLabel="Relación de guías"
      accionIcon={FileText}
      accionDisabled={!relacion?.habilitado}
      onAccion={() => irATramiteConGuias(RELACION, ids)}
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
