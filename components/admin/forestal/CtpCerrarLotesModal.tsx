"use client";

/**
 * Cerrar varios lotes abiertos de una vez (Brandon, 2026-10-02).
 *
 * Es la MISMA acción que la ficha del lote (`accion: "cerrar"` de
 * `/api/admin/forestal/lotes-aserrio`), repetida lote por lote con un solo
 * motivo: su madera libre vuelve al patio y el lote deja de figurar como
 * trabajo pendiente. Uno que falla no frena a los demás; al final se dice
 * cuántos se cerraron y por qué no los otros.
 */

import { useState } from "react";
import { Loader2, Lock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { motivoLegible } from "@/lib/forestal/motivo";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CampoMotivo, MarcoModalLotes } from "./ctp-lotes-modal-marco";
import { cerrarLote, despuesDeCerrar } from "./ctp-lotes-seleccion-api";

export default function CtpCerrarLotesModal({
  lotes,
  onClose,
  onListo,
}: {
  /** Sólo los abiertos: los demás ya no tienen nada que cerrar. */
  lotes: { id: string; code: string }[];
  onClose: () => void;
  onListo: (texto: string, tono: "ok" | "aviso") => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [hechos, setHechos] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const cerrar = async () => {
    setEnviando(true);
    const cerrados: string[] = [];
    const fallados: string[] = [];
    for (const l of lotes) {
      try {
        await cerrarLote(l.id, motivo);
        cerrados.push(l.code);
      } catch (e) {
        fallados.push(`${l.code} (${e instanceof Error ? e.message : String(e)})`);
      }
      setHechos((n) => n + 1);
    }
    despuesDeCerrar();
    onListo(
      `Se cerraron ${cerrados.length} de ${lotes.length} lote${lotes.length === 1 ? "" : "s"}` +
        (cerrados.length > 0 ? `: ${cerrados.join(", ")}. Su madera libre volvió al patio.` : ".") +
        (fallados.length > 0 ? ` No se pudo: ${fallados.join(" · ")}.` : ""),
      fallados.length > 0 ? "aviso" : "ok",
    );
  };

  return (
    <MarcoModalLotes
      titulo={`Cerrar ${lotes.length} lote${lotes.length === 1 ? "" : "s"}`}
      icono={<Lock className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />}
      ayuda={
        <InfoTip
          title="Cerrar un lote"
          what="Para el lote que no va a terminar de aserrarse."
          affects="Lo que no entró a la sierra vuelve al patio, libre para otro lote. Lo ya aserrado no se toca."
          example="Lote 13-2026 con 2 trozas sin aserrar: al cerrarlo, esas 2 vuelven al patio."
        />
      }
      onClose={onClose}
      ocupado={enviando}
      pie={
        <>
          <button type="button" className={BOTON_SECUNDARIO} onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={enviando || lotes.length === 0 || !motivoLegible(motivo)}
            onClick={() => void cerrar()}
          >
            {enviando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Lock className="h-5 w-5" aria-hidden />}
            {enviando ? `Cerrando ${hechos + 1} de ${lotes.length}…` : "Cerrar los lotes"}
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--text-secondary)]">
        Sólo los abiertos:{" "}
        <b className="font-mono text-[var(--text-primary)]">{lotes.map((l) => l.code).join(", ")}</b>
      </p>
      <CampoMotivo
        value={motivo}
        onChange={setMotivo}
        disabled={enviando}
        placeholder="Ej.: la madera que queda se vende en troza"
      />
    </MarcoModalLotes>
  );
}
