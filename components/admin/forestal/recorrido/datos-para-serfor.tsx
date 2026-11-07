"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useClipboard } from "@/hooks/use-clipboard";
import { logger } from "@/lib/logger";
import { ORIGEN_EN_PANTALLA, textoParaCopiar, type DatoSerfor } from "@/lib/forestal/recorrido-pantalla";

/**
 * «Datos listos para SERFOR»: lo que se tipea en el formulario de la GTF de
 * salida, en su orden, cada uno con «Copiar». Lo que no está queda vacío con
 * «falta»: la pantalla no inventa un RUC ni una placa.
 */

export default function DatosParaSerfor({ datos, cargando }: { datos: readonly DatoSerfor[]; cargando: boolean }) {
  const { copy } = useClipboard({ onError: (err) => logger.warn("[recorrido] copiar falló", { error: String(err) }) });
  const [copiado, setCopiado] = useState<string | null>(null);
  const faltan = datos.filter((d) => !d.valor).length;

  const copiar = (id: string, texto: string) => {
    void copy(texto);
    setCopiado(id);
    window.setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1800);
  };

  return (
    <div data-datos-serfor className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-[var(--text-primary)]">Datos listos para SERFOR</span>
        {cargando && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" aria-label="Leyendo" />}
        {!cargando && faltan > 0 && (
          <span className="text-xs font-bold text-[var(--data-warning-ink)]">
            {faltan} {faltan === 1 ? "dato falta" : "datos faltan"}
          </span>
        )}
        <InfoTip
          title="Datos para la GTF de salida"
          what="La guía la emite SERFOR en su sistema; acá tienes sus datos en el orden del formulario. Vienen del bloque, de su Anexo 04 y de tu última guía emitida (destinatario, transportista y vehículo)."
          affects="Lo que dice «falta» no está en ningún lado: llénalo allá. Si el transporte cambió, corrígelo allá: acá es sólo la propuesta."
          example="Copia la placa, pégala en SERFOR y sigue con el conductor."
        />
        <button
          type="button"
          onClick={() => copiar("*", textoParaCopiar(datos))}
          disabled={datos.length === 0}
          className={`${button({ variant: "secondary", size: "sm" })} ml-auto`}
        >
          {copiado === "*" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copiado === "*" ? "Copiado" : "Copiar todo"}
        </button>
      </div>

      <ul className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)]">
        {datos.map((d) => (
          <li key={d.id} data-dato={d.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <span className="block text-xs text-[var(--text-tertiary)]">
                {d.etiqueta}
                {d.origen && <span> · {ORIGEN_EN_PANTALLA[d.origen]}</span>}
              </span>
              {d.valor ? (
                <span className="block break-words text-sm font-bold text-[var(--text-primary)]">{d.valor}</span>
              ) : (
                <span className="block text-sm font-bold text-[var(--data-warning-ink)]">falta</span>
              )}
            </div>
            {d.valor && (
              <button
                type="button"
                onClick={() => copiar(d.id, d.valor)}
                aria-label={`Copiar ${d.etiqueta}`}
                title={`Copiar ${d.etiqueta}`}
                className={button({ variant: "secondary", size: "md", className: "shrink-0" })}
              >
                {copiado === d.id ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copiado === d.id ? "Copiado" : "Copiar"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
