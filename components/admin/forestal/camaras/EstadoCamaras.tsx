"use client";

/**
 * Arriba de las fotos, una línea por cámara: si está viva, cuándo avisó la
 * cámara por última vez (con o sin foto), «En vivo» y la dirección para pegarle. Lo que se mira todas las mañanas no
 * puede estar una pestaña más allá; el resto de la configuración (avisos,
 * pila, chalecos, alta) vive en «Cámaras».
 */

import { useState } from "react";
import { Check, Copy, RefreshCw } from "@buleje/design-system/icons";
import { estaCallada } from "@/lib/camaras/camaras";
import { cn } from "@/lib/utils";
import type { CamaraConConexion } from "./ConectarCamaraModal";
import { BTN, SOLO_ADMIN_DIRECCION } from "./camaras-ui";
import BotonEnVivo, { tieneVisorPropio } from "./BotonEnVivo";
import { lineaDeAviso } from "./ultimo-aviso";
import { useAhora } from "./use-plataforma";
import { camposPuente } from "./puente-pc";
import { SenalPuente } from "./VisorPuentePc";

interface Props {
  camaras: CamaraConConexion[];
  direccionParaCamara: (token: string) => string;
  /** Por qué no hay dirección que copiar (túnel cerrado, todavía averiguando). */
  motivoSinDireccion: string;
  guardando: boolean;
  onRotar: (id: string) => void;
  onErrorCopia: () => void;
  /** «En vivo» de una cámara con visor propio: llevarla a la vista «Cámaras». */
  onVerVisor: (id: string) => void;
}

export default function EstadoCamaras({
  camaras,
  direccionParaCamara,
  motivoSinDireccion,
  guardando,
  onRotar,
  onErrorCopia,
  onVerVisor,
}: Props) {
  const [copiada, setCopiada] = useState<string | null>(null);
  const ahora = useAhora();
  if (camaras.length === 0) return null;

  const copiar = async (c: CamaraConConexion) => {
    try {
      await navigator.clipboard.writeText(direccionParaCamara(c.token));
      setCopiada(c.id);
      setTimeout(() => setCopiada((k) => (k === c.id ? null : k)), 2500);
    } catch {
      onErrorCopia();
    }
  };

  return (
    <ul
      aria-label="Estado de las cámaras"
      className="divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4"
    >
      {camaras.map((c) => {
        const callada = estaCallada(c);
        const viva = Boolean(c.ultimaCapturaEn) && !callada;
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                viva
                  ? "bg-[var(--data-success-500)]"
                  : callada
                    ? "bg-[var(--data-warning-500)]"
                    : "bg-[var(--rule-strong)]/40",
              )}
            />
            <span className="min-w-0 flex-[1_1_12rem] text-sm">
              <span className="font-bold text-[var(--text-primary)]">{c.nombre}</span>
              <span className="text-[var(--text-tertiary)]">
                {" · "}
                {lineaDeAviso(c, ahora)}
                {callada ? " · no manda hace más de un día" : ""}
              </span>
            </span>
            {camposPuente(c).fuente === "puente_pc" && <SenalPuente camaraId={c.id} />}
            {/* Los dos botones viajan juntos: sueltos, a 400 px el de girar quedaba solo en otra fila. */}
            <span className="flex shrink-0 items-center gap-2">
              <BotonEnVivo
                nombre={c.nombre}
                camaraId={c.id}
                onVisorPropio={tieneVisorPropio(c) ? () => onVerVisor(c.id) : undefined}
              />
              <button
                type="button"
                onClick={() => void copiar(c)}
                disabled={!direccionParaCamara(c.token)}
                title={
                  direccionParaCamara(c.token)
                    ? "Copiar la dirección para pegarla en la cámara"
                    : c.token
                      ? motivoSinDireccion
                      : SOLO_ADMIN_DIRECCION
                }
                className={BTN}
              >
                {copiada === c.id ? (
                  <Check className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copiada === c.id ? "Copiada" : "Copiar dirección"}
              </button>
              <button
                type="button"
                onClick={() => onRotar(c.id)}
                disabled={guardando}
                title="Dirección nueva: la anterior deja de funcionar"
                aria-label={`Cambiar la dirección de ${c.nombre}`}
                className={cn(BTN, "w-9 justify-center px-0")}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
