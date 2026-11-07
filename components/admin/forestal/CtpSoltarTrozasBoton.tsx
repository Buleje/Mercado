"use client";

/**
 * «Soltar trozas» en la ficha de una corrida (ADR-447 §6): el botón y su modal.
 *
 * Lo ve sólo quien puede cambiar la madera de un asiento (dueño o
 * administrador, `puedeFirmarVinculo`); el servidor lo exige igual. Mientras el
 * rol no llegó se muestra y decide el servidor, como en la bandeja.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
import { Link2Off } from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import { fraseDeSoltar, type ResultadoSoltarTrozas } from "@/lib/forestal/soltar-trozas";
import { Btn } from "./ctp-shared";
import { puedeFirmarVinculo } from "./CtpVincularMixtoModal";

const CtpSoltarTrozasModal = dynamic(() => import("./CtpSoltarTrozasModal"), { ssr: false });

export default function CtpSoltarTrozasBoton({
  corridaId,
  lineNo,
  onSoltadas,
}: {
  corridaId: string;
  lineNo: number;
  /** Ya se soltaron: la ficha se relee y muestra la madera y el rendimiento de después. */
  onSoltadas: (r: Extract<ResultadoSoltarTrozas, { ok: true }>) => void;
}) {
  const rol = useMiRol();
  const [abierto, setAbierto] = useState(false);
  if (rol != null && !puedeFirmarVinculo(rol)) return null;
  return (
    <>
      <Btn size="sm" variant="secondary" onClick={() => setAbierto(true)} title="Las que no entraron vuelven al patio; lo producido no cambia">
        <Link2Off aria-hidden className="h-3.5 w-3.5" /> Soltar trozas
      </Btn>
      {abierto && (
        <CtpSoltarTrozasModal
          corridaId={corridaId}
          lineNo={lineNo}
          aboveModals
          onClose={() => setAbierto(false)}
          onListo={(r) => {
            setAbierto(false);
            toast.success(fraseDeSoltar(r));
            onSoltadas(r);
          }}
        />
      )}
    </>
  );
}
