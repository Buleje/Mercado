"use client";

/**
 * «Cargas medidas (n)» en «Trozas sin despachar» del despacho con guía (16-10,
 * F3), al lado de «Anotar a mano». Sin cargas del monte no dibuja nada: la
 * mayoría de las guías se arman sin ellas.
 *
 * Si «Anotar a mano» queda vacío, las cargas que se habían usado se sueltan:
 * sin filas, registrar la guía no puede marcarlas usadas.
 */
import { useEffect, useState } from "react";
import { Camera } from "@buleje/design-system/icons";
import dynamic from "next/dynamic";
import { Btn } from "./ctp-shared";
import { useCargasMedidas } from "./hooks/use-cargas-medidas";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";

const LothCargasMedidasModal = dynamic(() => import("./LothCargasMedidasModal"), { ssr: false });

export default function LothCargasMedidas({ g }: { g: DespachoGuiaLoth }) {
  const cm = useCargasMedidas({ soloCargas: true });
  const [abierto, setAbierto] = useState(false);
  const n = cm.datos?.cargas.length ?? 0;
  const sinFilas = g.aMano.filas.length === 0;
  const { cargas: enUso, soltarCarga } = g.fotosCarga;

  useEffect(() => {
    if (sinFilas) for (const id of enUso) soltarCarga(id);
  }, [sinFilas, enUso, soltarCarga]);

  if (n === 0 && !abierto) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-2 sm:col-span-12" data-qa="cargas-medidas">
      <Camera className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
      <span className="text-sm text-[var(--text-secondary)]">
        {enUso.length > 0
          ? `${enUso.length} ${enUso.length === 1 ? "carga del monte va" : "cargas del monte van"} en esta guía`
          : `El monte midió ${n} ${n === 1 ? "carga" : "cargas"} sin usar`}
      </span>
      <Btn size="sm" className="ml-auto" onClick={() => setAbierto(true)} data-qa="abrir-cargas-medidas">
        Cargas medidas ({n})
      </Btn>
      {abierto && <LothCargasMedidasModal g={g} cm={cm} onClose={() => setAbierto(false)} />}
    </div>
  );
}
