"use client";

/**
 * El pie de la ficha de una troza: lo que se hace con ESTA pieza sin salir de
 * ella. «Armar un lote» es la acción principal (sólo si la pila la acepta;
 * si no, se dice por qué en una línea); el resto —copiar el código, la
 * etiqueta QR, verla en el croquis— aparece sólo cuando aplica a la pieza.
 * «Anotar D1 y D2» no va acá: vive junto a las medidas que faltan.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Layers, MapPin, QrCode } from "@buleje/design-system/icons";
import { Btn } from "./ctp-shared";

export interface AccionesDeFichaProps {
  codigo: string;
  /** La pila la acepta y hay quien la reciba. */
  onArmarLote?: () => void;
  /** Por qué no se puede armar un lote con ella (sólo si la pieza sigue en el patio). */
  motivoSinLote?: string | null;
  onEtiqueta?: () => void;
  /** Su carga tiene cancha en el mapa de planta. */
  onCroquis?: () => void;
  canchaNombre?: string | null;
}

/** El rótulo corto en el celular y el completo desde 640 px. */
function Corto({ corto, largo }: { corto: string; largo: string }) {
  return (
    <>
      <span className="sm:hidden">{corto}</span>
      <span className="hidden sm:inline">{largo}</span>
    </>
  );
}

export function AccionesDeFicha({ codigo, onArmarLote, motivoSinLote, onEtiqueta, onCroquis, canchaNombre }: AccionesDeFichaProps) {
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  const copiar = () => {
    const avisar = (r: "si" | "no") => {
      setCopiado(r);
      if (reloj.current) clearTimeout(reloj.current);
      reloj.current = setTimeout(() => setCopiado(null), 2000);
    };
    if (!navigator.clipboard) return avisar("no");
    navigator.clipboard.writeText(codigo).then(() => avisar("si"), () => avisar("no"));
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {/* En el celular, una sola fila de botones iguales con el rótulo corto. */}
      <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex sm:flex-wrap">
        <Btn onClick={copiar} aria-live="polite" title={`Copiar ${codigo}`}>
          {copiado === "si" ? <Check className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copiado === "si" ? "Copiado" : copiado === "no" ? "No se copió" : <Corto corto="Copiar" largo="Copiar código" />}
        </Btn>
        {onEtiqueta && (
          <Btn onClick={onEtiqueta}>
            <QrCode className="h-4 w-4" aria-hidden /> <Corto corto="Etiqueta" largo="Etiqueta QR" />
          </Btn>
        )}
        {onCroquis && (
          <Btn onClick={onCroquis} title={canchaNombre ? `Su carga está en ${canchaNombre}` : undefined}>
            <MapPin className="h-4 w-4" aria-hidden /> <Corto corto="Croquis" largo="Ver en el croquis" />
          </Btn>
        )}
      </div>
      {onArmarLote ? (
        <Btn variant="primary" onClick={onArmarLote}>
          <Layers className="h-4 w-4" aria-hidden /> Armar un lote con esta troza
        </Btn>
      ) : motivoSinLote ? (
        <p className="text-xs text-[var(--text-secondary)] sm:max-w-[16rem] sm:text-right">
          <span className="font-bold text-[var(--text-primary)]">Sin lote: </span>
          {motivoSinLote}
        </p>
      ) : null}
    </div>
  );
}
