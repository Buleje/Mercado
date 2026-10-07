"use client";

/**
 * «Ver todas en vivo» (ADR-471): todas las cámaras enlazadas a Hik-Connect a
 * la vez, a lo ancho de la ventana — 2 columnas grandes en la PC, una debajo
 * de otra en el celular —, cada una con sus controles (ADR-472). Arranca en
 * SD (menos datos), pide el video de a una (Hikvision corta a 5 pedidos/s) y
 * lleva UN reloj de 5 min sin tocar para todo el mosaico. Al cerrar, cada
 * cuadro suelta su reproductor (`destroy` de EZUIKit en el desmontaje).
 */

import { Battery, LayoutGrid, Play, Tv } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BTN } from "./camaras-ui";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import MosaicoNubeCuadro, { type CamaraMosaico } from "./MosaicoNubeCuadro";
import { RETRASO_ENTRE_CUADROS_MS, useMosaicoNube, vecesMas } from "./use-mosaico-nube";

interface Props {
  camaras: readonly CamaraMosaico[];
  onCerrar: () => void;
  onVerFotos: () => void;
  /** Base de la API de cada cuadro (`TV_API_TV` = sólo mirar). */
  baseApi?: string;
  /** «Verlo en el televisor» (Modo TV): el canvas de Hik-Connect no se puede transmitir. */
  onVerEnTv?: () => void;
}

export default function MosaicoNube({ camaras, onCerrar, onVerFotos, baseApi, onVerEnTv }: Props) {
  const m = useMosaicoNube();

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={`En vivo · todas (${camaras.length})`}
      description="Video de Hik-Connect dentro del panel"
      icon={LayoutGrid}
      variant="info"
      ventana={false}
      className="sm:max-w-[96vw]"
    >
      <div
        className={`${MODAL_BODY} space-y-3`}
        onPointerDown={m.actividad}
        onKeyDown={m.actividad}
        data-mosaico-nube
      >
        <p className="flex items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
          <Battery className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <span className="min-w-0 flex-1">
            Gasta {vecesMas(camaras.length)} de batería y datos mientras está abierto.
          </span>
          <InfoTip
            title="Batería y datos"
            what={`Cada cámara transmite a la vez y gasta ${DATOS_POR_HORA} de su chip (SD gasta menos que HD).`}
            affects={`Si nadie toca el mosaico por ${MINUTOS_SIN_TOCAR} minutos, se pausan todas. Cerrar esta ventana corta todas.`}
            example="Para mirar una sola con calma, cierra esto y usa «En vivo» de esa cámara."
          />
          {onVerEnTv && (
            <button
              type="button"
              onClick={onVerEnTv}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)] underline-offset-4 hover:underline dark:text-[var(--accent)]"
              title="El Modo TV muestra las cámaras en el navegador del televisor"
            >
              <Tv className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">Verlo en el televisor</span>
            </button>
          )}
        </p>

        {m.cortado && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <span className="min-w-0 flex-1">
              Se pausaron tras {MINUTOS_SIN_TOCAR} min sin tocar, para cuidar la batería.
            </span>
            <button type="button" onClick={m.seguir} className={BTN}>
              <Play className="h-4 w-4" aria-hidden /> Seguir viendo
            </button>
          </div>
        )}

        <ul className="grid gap-3 md:grid-cols-2">
          {camaras.map((c, i) => (
            <MosaicoNubeCuadro
              key={c.id}
              camara={c}
              activo={!m.cortado}
              retrasoMs={i * RETRASO_ENTRE_CUADROS_MS}
              onActividad={m.actividad}
              onVerFotos={onVerFotos}
              baseApi={baseApi}
            />
          ))}
        </ul>
      </div>
    </AdminModal>
  );
}
