"use client";

import { useMemo } from "react";
import { Link2 } from "@buleje/design-system/icons";
import Plegable from "@/components/admin/shared/Plegable";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { leerVinculo, TIPO_TERCERO_LABEL, vinculosDeCarpeta } from "@/lib/documentos/terceros-vinculo";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { ICONO_TERCERO } from "../terceros/compartido";
import EnElSistema from "./EnElSistema";
import { useNombresLigados } from "./use-tercero-en-el-sistema";
import { useNombresVinculos } from "../terceros/use-nombres-vinculos";

const AYUDA = {
  what: "Liga la carpeta a la comunidad, proveedor, cliente, colaborador o persona de la que son los papeles (el mismo vínculo de Archivo › Terceros).",
  affects: "Una vez ligada, aquí ves lo que ya tiene en los otros módulos —su cuenta, sus permisos, sus guías, sus compras— con el enlace para ir. Ligar lo hace el dueño o un admin.",
  example: "«CCNN Santa Rosa» ligada a la comunidad: «Te debe S/ 1,250.00 · 3 guías · 1 permiso vigente».",
};

/**
 * «Ligar a…» y «De <tercero> en el sistema» del panel de Esenciales (Brandon
 * 24-10). Sin vínculo: una línea con el botón. Con vínculo: un plegable por
 * tercero con lo que tiene en los otros módulos (se pide al abrirlo).
 */
export default function LigadaA({ carpeta, onLigar }: { carpeta: DbDocumentFolder; onLigar: () => void }) {
  const claves = useMemo(() => vinculosDeCarpeta(carpeta), [carpeta]);
  const nombres = useNombresLigados(carpeta.id, claves);
  // El alias vivo: se renombra en «Vínculos con el sistema…» y se ve acá sin recargar.
  const vivos = useNombresVinculos(claves);
  const ligar = (
    <button type="button" onClick={onLigar} title="Ligar a…" aria-label="Ligar la carpeta a un tercero" className={button({ variant: "ghost", size: "icon" })} data-qa="esencial-ligar">
      <Link2 className="h-5 w-5" />
    </button>
  );

  if (claves.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] py-1 pl-3 pr-1" data-qa="esencial-sin-ligar">
        <span className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">Sin ligar a nadie</span>
        <InfoTip {...AYUDA} />
        <button type="button" onClick={onLigar} className={cn(button({ variant: "secondary", size: "md" }), "gap-2")} data-qa="esencial-ligar">
          <Link2 className="h-4 w-4" /> Ligar a…
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-qa="esencial-ligada">
      {claves.map((clave, i) => {
        const v = leerVinculo(clave);
        if (!v) return null;
        const Icono = ICONO_TERCERO[v.tipo];
        const n = nombres[clave];
        const vivo = vivos[clave];
        const nombre = vivo ? vivo.alias?.trim() || n?.nombre || vivo.nombre : n?.alias?.trim() || n?.nombre;
        return (
          <Plegable
            key={clave}
            clave={`esenciales:panel:en-el-sistema:${v.tipo}`}
            titulo={
              <span className="inline-flex min-w-0 items-center gap-2">
                <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                <span className="min-w-0 break-words">{nombre ? `De ${nombre} en el sistema` : `Ligada a ${TIPO_TERCERO_LABEL[v.tipo].uno.toLowerCase()}`}</span>
              </span>
            }
            acciones={
              <>
                {i === 0 && <InfoTip {...AYUDA} />}
                {i === 0 && ligar}
              </>
            }
          >
            <EnElSistema carpetaId={carpeta.id} clave={clave} />
          </Plegable>
        );
      })}
    </div>
  );
}
