"use client";

/**
 * Bajar la plantilla del libro: entera (cinco hojas) o una sección suelta. Es
 * el MISMO formato —lo escribe la misma función— así que las dos entran por la
 * misma pantalla. Vive en el pie del import y no en un menú: es lo que se
 * busca cuando uno abre esta pantalla y no tiene el archivo.
 */

import { useState } from "react";
import { Download } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { logger } from "@/lib/logger";
import { FORMATOS_LIBRO, TITULO_FORMATO, type FormatoLibro } from "@/lib/forestal/ctp-formatos-serfor";
import { descargarPlantillaDeSeccion, descargarPlantillaSerfor } from "@/lib/forestal/ctp-serfor-plantilla";

export default function BajarPlantilla({ onError }: { onError: (mensaje: string) => void }) {
  const [bajandoPlantilla, setBajandoPlantilla] = useState(false);

  /** `null` = el libro completo; un formato = esa sección suelta. */
  const bajarPlantilla = async (formato: FormatoLibro | null) => {
    setBajandoPlantilla(true);
    try {
      await (formato ? descargarPlantillaDeSeccion(formato) : descargarPlantillaSerfor());
    } catch (e) {
      logger.error("[ctp-serfor-import] no se pudo generar la plantilla", { error: String(e), formato });
      onError("No se pudo generar la plantilla.");
    } finally {
      setBajandoPlantilla(false);
    }
  };

  return (
    <div className="mr-auto flex flex-wrap items-center gap-2">
      <button
        onClick={() => void bajarPlantilla(null)}
        disabled={bajandoPlantilla}
        className={button({ variant: "secondary" })}
      >
        <Download className="h-5 w-5" /> {bajandoPlantilla ? "Generando…" : "Libro completo"}
      </button>
      <label className="sr-only" htmlFor="plantilla-seccion">
        Descargar una sección suelta
      </label>
      <select
        id="plantilla-seccion"
        value=""
        disabled={bajandoPlantilla}
        onChange={(e) => {
          const v = e.target.value as FormatoLibro | "";
          if (v) void bajarPlantilla(v);
          e.target.value = "";
        }}
        className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base font-bold text-[var(--text-secondary)] disabled:opacity-50"
      >
        <option value="">…o una sección suelta</option>
        {FORMATOS_LIBRO.map((f) => (
          <option key={f} value={f}>
            {TITULO_FORMATO[f]}
          </option>
        ))}
      </select>
    </div>
  );
}
