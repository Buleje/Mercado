"use client";

/**
 * PlantacionesModule — raíz del Registro de Plantación Forestal (RNPF).
 * Sólo decide qué se ve: la lista o el wizard de una plantación puntual.
 */

import { useState } from "react";
import PlantacionListado from "./PlantacionListado";
import PlantacionWizard from "./PlantacionWizard";

type Vista = "listado" | "wizard";

export default function PlantacionesModule() {
  const [vista, setVista] = useState<Vista>("listado");
  const [plantacionId, setPlantacionId] = useState<string | null>(null);
  const [soloLectura, setSoloLectura] = useState(false);
  const [pasoInicial, setPasoInicial] = useState<string | undefined>(undefined);

  function abrirNueva() {
    setPlantacionId(null);
    setSoloLectura(false);
    setPasoInicial(undefined);
    setVista("wizard");
  }

  function abrir(id: string, opts?: { soloLectura?: boolean; irARevision?: boolean }) {
    setPlantacionId(id);
    setSoloLectura(Boolean(opts?.soloLectura));
    setPasoInicial(opts?.irARevision ? "revision" : undefined);
    setVista("wizard");
  }

  function cerrar() {
    setVista("listado");
    setPlantacionId(null);
  }

  if (vista === "wizard") {
    return <PlantacionWizard plantacionId={plantacionId} soloLectura={soloLectura} pasoInicial={pasoInicial} onCerrar={cerrar} />;
  }

  return <PlantacionListado onNueva={abrirNueva} onAbrir={abrir} />;
}
