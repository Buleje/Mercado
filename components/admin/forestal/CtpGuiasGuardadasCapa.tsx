"use client";

/**
 * CtpGuiasGuardadasCapa — los modales de las guías guardadas antes del ingreso
 * (ADR-442) que se abren desde Ingresos: el listado, una guía (nueva o
 * existente) y sus documentos. La vista sólo guarda CUÁL está abierto; esto
 * decide qué dibujar, para no sumarle tres montajes más a `CtpIngresosView`.
 */

import type { GuiaGuardadaDetalle, GuiaGuardadaVista } from "@/lib/forestal/guias-guardadas";
import CtpDocumentosGuiaModal from "./CtpDocumentosGuiaModal";
import CtpGuiaGuardadaModal from "./CtpGuiaGuardadaModal";
import CtpGuiasGuardadasModal from "./CtpGuiasGuardadasModal";

export type ModalGuardadas =
  | { tipo: "lista" }
  | { tipo: "guia"; id: string | null; inicial?: GuiaGuardadaVista }
  | { tipo: "docs"; guia: GuiaGuardadaVista }
  | null;

export default function CtpGuiasGuardadasCapa({
  abierto,
  onCerrar,
  onCambio,
  onIngresar,
}: {
  abierto: ModalGuardadas;
  onCerrar: () => void;
  /** Algo cambió (guía guardada/eliminada, papeles): la bandeja se relee. */
  onCambio: () => void;
  onIngresar: (guia: GuiaGuardadaDetalle) => void;
}) {
  if (!abierto) return null;
  if (abierto.tipo === "lista")
    return <CtpGuiasGuardadasModal onClose={onCerrar} onCambio={onCambio} onIngresar={onIngresar} />;
  if (abierto.tipo === "guia")
    return (
      <CtpGuiaGuardadaModal
        key={abierto.id ?? "nueva"}
        guiaId={abierto.id}
        inicial={abierto.inicial}
        onClose={onCerrar}
        onCambio={onCambio}
        onIngresar={onIngresar}
      />
    );
  const g = abierto.guia;
  return (
    <CtpDocumentosGuiaModal
      gtf={g.gtfNumber}
      contexto={[g.titularNombre, g.permisoCodigo].filter(Boolean).join(" · ") || undefined}
      onClose={onCerrar}
      onCambio={(n) => {
        if (n !== g.docsLlenos) onCambio();
      }}
    />
  );
}
