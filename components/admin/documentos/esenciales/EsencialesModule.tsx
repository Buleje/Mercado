"use client";

import { useArchivo } from "../archivo/use-archivo";
import ModalesArchivo from "../archivo/ModalesArchivo";
import VistaEsenciales from "./VistaEsenciales";

/**
 * Documentos › Esenciales (`?vista=esenciales`). Usa el MISMO modelo del
 * Archivo (carpetas y papeles ya filtrados por rol y candado, vista previa,
 * menú de cada papel, compartir, expediente, terceros) pero sin su cabecera ni
 * su barra de vistas: sólo las carpetas marcadas y su panel. La vista previa
 * la monta `VistaEsenciales`, que sabe por qué papeles pasan sus flechas.
 */
export default function EsencialesModule({ onAbrirEnArchivo }: { onAbrirEnArchivo: (carpetaId: string | null) => void }) {
  const arch = useArchivo();
  const { ex, docDelMenu, menuDe } = arch;
  return (
    <div className="space-y-4">
      <VistaEsenciales arch={arch} onAbrirEnArchivo={onAbrirEnArchivo} />
      {/* El clic derecho de un papel y su menú de siempre. */}
      {ex.capas}
      {docDelMenu && menuDe(docDelMenu, "fila", true)}
      <ModalesArchivo arch={arch} />
    </div>
  );
}
